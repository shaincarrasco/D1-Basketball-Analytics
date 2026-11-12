//! Verifies Neon Auth (Managed Better Auth) JWTs: EdDSA, keys from the branch's JWKS,
//! issuer and audience = the auth URL's origin. Keys are cached and refreshed on an
//! unknown `kid` (at most once a minute).

use std::{collections::HashMap, time::{Duration, Instant}};

use axum::http::HeaderMap;
use jsonwebtoken::{decode, decode_header, Algorithm, DecodingKey, Validation};
use serde::Deserialize;
use tokio::sync::RwLock;

#[derive(Debug, Deserialize, Clone)]
pub struct Claims { pub sub: String, #[serde(default)] pub email: Option<String> }

pub struct Jwks {
    url: Option<String>,
    origin: Option<String>,
    keys: RwLock<(HashMap<String, DecodingKey>, Option<Instant>)>,
}

impl Jwks {
    pub fn new(auth_url: Option<String>) -> Self {
        let origin = auth_url.as_deref().and_then(|u| reqwest::Url::parse(u).ok()).map(|u| u.origin().ascii_serialization());
        Jwks { url: auth_url.map(|u| format!("{u}/.well-known/jwks.json")), origin, keys: RwLock::new((HashMap::new(), None)) }
    }
    pub fn enabled(&self) -> bool { self.url.is_some() }

    async fn refresh(&self, http: &reqwest::Client) {
        let Some(url) = &self.url else { return };
        {
            let guard = self.keys.read().await;
            if guard.1.is_some_and(|t| t.elapsed() < Duration::from_secs(60)) { return; }
        }
        let Ok(resp) = http.get(url).send().await else { return };
        let Ok(body) = resp.json::<serde_json::Value>().await else { return };
        let mut map = HashMap::new();
        for k in body["keys"].as_array().into_iter().flatten() {
            if let (Some(kid), Some(x)) = (k["kid"].as_str(), k["x"].as_str()) {
                if let Ok(key) = DecodingKey::from_ed_components(x) { map.insert(kid.to_string(), key); }
            }
        }
        *self.keys.write().await = (map, Some(Instant::now()));
    }

    pub async fn verify(&self, http: &reqwest::Client, token: &str) -> Option<Claims> {
        let origin = self.origin.as_ref()?;
        let kid = decode_header(token).ok()?.kid?;
        if !self.keys.read().await.0.contains_key(&kid) { self.refresh(http).await; }
        let guard = self.keys.read().await;
        let key = guard.0.get(&kid)?;
        let mut v = Validation::new(Algorithm::EdDSA);
        v.set_issuer(&[origin]);
        v.set_audience(&[origin]);
        decode::<Claims>(token, key, &v).ok().map(|d| d.claims)
    }
}

pub async fn user_from(headers: &HeaderMap, state: &crate::AppState) -> Option<Claims> {
    let token = headers.get("authorization")?.to_str().ok()?.strip_prefix("Bearer ")?;
    state.jwks.verify(&state.http, token).await
}

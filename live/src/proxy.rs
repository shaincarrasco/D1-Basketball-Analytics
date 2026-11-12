//! Same-origin proxy for Neon Auth: the browser talks to /auth/* on our domain, so
//! session cookies are first-party (Safari's ITP blocks third-party auth cookies).

use axum::{
    body::{to_bytes, Body},
    extract::{Path, State},
    http::{HeaderMap, HeaderValue, Method, Response, StatusCode},
};

use crate::Shared;

const FORWARD: &[&str] = &["content-type", "cookie", "authorization", "accept", "user-agent", "x-forwarded-for"];

pub async fn auth_proxy(State(state): State<Shared>, Path(rest): Path<String>, method: Method, headers: HeaderMap, uri: axum::http::Uri, body: Body) -> Response<Body> {
    let Some(base) = &state.cfg.neon_auth_url else {
        return Response::builder().status(StatusCode::SERVICE_UNAVAILABLE).body(Body::from("Accounts are not configured on this server.")).unwrap();
    };
    let query = uri.query().map(|q| format!("?{q}")).unwrap_or_default();
    let target = format!("{base}/{rest}{query}");
    let Ok(bytes) = to_bytes(body, 1 << 20).await else { return Response::builder().status(StatusCode::PAYLOAD_TOO_LARGE).body(Body::empty()).unwrap() };
    let mut req = state.http.request(method, &target).body(bytes);
    for name in FORWARD { if let Some(v) = headers.get(*name) { req = req.header(*name, v.clone()); } }
    // Better Auth checks Origin against the branch's trusted origins: present our public URL.
    req = req.header("origin", state.cfg.public_url.as_str());
    let resp = match req.send().await {
        Ok(r) => r,
        Err(e) => return Response::builder().status(StatusCode::BAD_GATEWAY).body(Body::from(format!("Auth service unreachable: {e}"))).unwrap(),
    };
    let mut out = Response::builder().status(resp.status().as_u16());
    for (name, value) in resp.headers() {
        let n = name.as_str();
        if n == "set-cookie" {
            // Bind cookies to our host: drop any Domain attribute.
            let v = value.to_str().unwrap_or_default().split(';').filter(|p| !p.trim().to_ascii_lowercase().starts_with("domain=")).collect::<Vec<_>>().join(";");
            if let Ok(h) = HeaderValue::from_str(&v) { out = out.header("set-cookie", h); }
        } else if n == "location" {
            let v = value.to_str().unwrap_or_default().replace(base.as_str(), &format!("{}/auth", state.cfg.public_url));
            if let Ok(h) = HeaderValue::from_str(&v) { out = out.header("location", h); }
        } else if ["content-type", "set-auth-jwt", "cache-control"].contains(&n) {
            out = out.header(name, value.clone());
        }
    }
    out.body(Body::from(resp.bytes().await.unwrap_or_default())).unwrap()
}

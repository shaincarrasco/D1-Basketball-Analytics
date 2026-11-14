// D1 Hoops service worker: shows game alerts and opens the game when one is tapped.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", e => e.waitUntil(self.clients.claim()));
// The alert's url (a specific game, /games/?d=…&g=…), kept on this site's origin so a tap always
// lands where the subscription was made, even if the server's PUBLIC_URL names another domain.
function target(raw) {
  try {
    const u = new URL(raw || "/games/", self.location.origin);
    return u.origin === self.location.origin ? u.href : new URL(u.pathname + u.search + u.hash, self.location.origin).href;
  } catch { return new URL("/games/", self.location.origin).href; }
}
self.addEventListener("push", e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { title: "D1 Hoops", body: e.data && e.data.text() }; }
  e.waitUntil(self.registration.showNotification(d.title || "D1 Hoops", { body: d.body || "", tag: d.tag, data: { url: target(d.url) }, icon: "/icons/icon-192.png", badge: "/icons/icon-192.png" }));
});
self.addEventListener("notificationclick", e => {
  e.notification.close();
  const url = target(e.notification.data && e.notification.data.url);
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(async list => {
    for (const c of list) {
      if (!c.url.startsWith(self.location.origin) || !("focus" in c)) continue;
      // navigate() only works on pages this worker controls; otherwise open a new window.
      const moved = c.url === url ? c : await c.navigate(url).catch(() => null);
      if (moved) return moved.focus();
    }
    return self.clients.openWindow(url);
  }));
});

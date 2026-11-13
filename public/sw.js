// D1 Hoops service worker: shows game alerts and opens the site when one is tapped.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", e => e.waitUntil(self.clients.claim()));
self.addEventListener("push", e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { title: "D1 Hoops", body: e.data && e.data.text() }; }
  e.waitUntil(self.registration.showNotification(d.title || "D1 Hoops", { body: d.body || "", tag: d.tag, data: { url: d.url || "/games/" }, icon: "/icons/icon-192.png", badge: "/icons/icon-192.png" }));
});
self.addEventListener("notificationclick", e => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || "/games/";
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(list => {
    for (const c of list) if (c.url.startsWith(self.location.origin) && "focus" in c) { c.navigate(url); return c.focus(); }
    return self.clients.openWindow(url);
  }));
});

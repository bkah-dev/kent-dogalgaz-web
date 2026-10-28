// Kent Doğalgaz iş takip — service worker (sadece bildirim; önbellekleme yok).
// Kök dizinde durur çünkü uygulama /admin (sondaki eğik çizgi olmadan) adresinde; kapsam kayıt sırasında "/admin" verilir.
const APP_PATH = "/admin";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = { title: "Kent İş", body: event.data ? event.data.text() : "" }; }
  const title = data.title || "Kent İş";
  const options = {
    body: data.body || "",
    tag: data.tag || undefined,
    renotify: Boolean(data.tag),
    icon: "/apple-touch-icon.png",
    badge: "/favicon-96x96.png",
    data: { url: data.url || APP_PATH, job: data.job || null, tpl: data.tpl || null },
  };
  const work = [self.registration.showNotification(title, options)];
  if (typeof data.badge === "number" && self.navigator && "setAppBadge" in self.navigator) {
    work.push(self.navigator.setAppBadge(data.badge).catch(() => {}));
  }
  event.waitUntil(Promise.all(work));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const d = event.notification.data || {};
  const url = d.url || APP_PATH;
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const client = all.find((c) => new URL(c.url).pathname.startsWith(APP_PATH));
    if (client) {
      if ("focus" in client) await client.focus();
      client.postMessage({ type: "open-job", job: d.job, tpl: d.tpl });
      return;
    }
    await self.clients.openWindow(url);
  })());
});

// 영웅이노트 service worker: receives shares from other apps (Android share sheet).
const SHARE_CACHE = "yw-share";
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", e => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);
  if (e.request.method !== "POST" || !url.pathname.endsWith("/share-target")) return;
  e.respondWith((async () => {
    const scope = self.registration.scope;
    try {
      const fd = await e.request.formData();
      const c = await caches.open(SHARE_CACHE);
      for (const k of await c.keys()) await c.delete(k);
      const meta = { title: String(fd.get("title") || ""), text: String(fd.get("text") || ""), url: String(fd.get("url") || ""), files: [], at: Date.now() };
      let i = 0;
      for (const f of fd.getAll("media")) {
        if (!f || typeof f === "string" || !f.size) continue;
        const key = new URL(`shared/${i++}`, scope).href;
        await c.put(key, new Response(f, { headers: { "content-type": f.type || "application/octet-stream" } }));
        meta.files.push({ key, type: f.type || "", name: f.name || "" });
      }
      await c.put(new URL("shared/meta", scope).href, new Response(JSON.stringify(meta), { headers: { "content-type": "application/json" } }));
    } catch (err) {}
    return Response.redirect(new URL("./?share=1", scope).href, 303);
  })());
});

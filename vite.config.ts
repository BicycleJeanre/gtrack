import { defineConfig, type Plugin } from "vite";
function offline(): Plugin {
  return {
    name: "gtrack-offline",
    apply: "build",
    generateBundle(_, bundle) {
      const assets = [
        "index.html",
        "manifest.webmanifest",
        "icon.svg",
        "icon-192.png",
        "icon-512.png",
        "apple-touch-icon.png",
        ...Object.keys(bundle).filter((f) => !f.endsWith(".map")),
      ];
      const version = "gtrack-" + Date.now();
      this.emitFile({
        type: "asset",
        fileName: "sw.js",
        source: `
const CACHE=${JSON.stringify(version)};
const BASE=new URL('./',self.location.href);
const ASSETS=${JSON.stringify([...new Set(assets)])}.map(p=>new URL(p,BASE).href);
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS.map(url=>new Request(url,{cache:'reload'}))))));
self.addEventListener('message',event=>{if(event.data?.type==='SKIP_WAITING')self.skipWaiting()});
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('gtrack-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
 if(event.request.method!=='GET'||new URL(event.request.url).origin!==BASE.origin)return;
 if(event.request.mode==='navigate'&&new URL(event.request.url).pathname.startsWith(BASE.pathname)){
   event.respondWith(caches.open(CACHE).then(cache=>cache.match(new URL('index.html',BASE).href)).then(hit=>hit||fetch(event.request)));return;
 }
 if(ASSETS.includes(event.request.url))event.respondWith(caches.open(CACHE).then(cache=>cache.match(event.request,{ignoreVary:true})).then(hit=>hit||fetch(event.request)));
});
self.addEventListener('notificationclick',event=>{
 event.notification.close();
 event.waitUntil(clients.matchAll({type:'window',includeUncontrolled:true}).then(items=>{
   const existing=items.find(client=>client.url.startsWith(BASE.href));
   return existing?existing.focus():clients.openWindow(BASE.href);
 }));
});`,
      });
    },
  };
}
export default defineConfig({
  base: process.env.BASE_PATH || "./",
  plugins: [offline()],
  server: { host: "127.0.0.1", port: 5173, strictPort: true },
  preview: { host: "127.0.0.1", port: 4173, strictPort: true },
});

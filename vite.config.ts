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
      const uniqueAssets = [...new Set(assets)],
        optionalAssets = uniqueAssets.filter((file) =>
          /\.(?:jpe?g|webp)$/i.test(file),
        ),
        coreAssets = uniqueAssets.filter(
          (file) => !optionalAssets.includes(file),
        );
      const version = "gtrack-" + Date.now();
      this.emitFile({
        type: "asset",
        fileName: "sw.js",
        source: `
const CACHE=${JSON.stringify(version)};
const BASE=new URL('./',self.location.href);
const CORE=${JSON.stringify(coreAssets)}.map(p=>new URL(p,BASE).href);
const OPTIONAL=${JSON.stringify(optionalAssets)}.map(p=>new URL(p,BASE).href);
const ASSETS=new Set([...CORE,...OPTIONAL]);
const INDEX=new URL('index.html',BASE).href;
const reloadRequest=url=>new Request(url,{cache:'reload'});
const cacheStatus=()=>caches.open(CACHE).then(cache=>Promise.all(OPTIONAL.map(url=>cache.match(url))).then(hits=>({type:'OFFLINE_CACHE_STATUS',optionalReady:hits.every(Boolean),cachedOptional:hits.filter(Boolean).length,totalOptional:OPTIONAL.length})));
const notifyCacheStatus=()=>cacheStatus().then(status=>clients.matchAll({type:'window',includeUncontrolled:true}).then(items=>items.forEach(client=>client.postMessage(status))));
const warmOptional=()=>caches.open(CACHE).then(cache=>Promise.allSettled(OPTIONAL.map(async url=>{
 if(await cache.match(url))return;
 const response=await fetch(reloadRequest(url));
 if(!response.ok)throw new Error('Could not cache '+url);
 if(response.ok)await cache.put(url,response);
}))).then(notifyCacheStatus);
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(CORE.map(reloadRequest)))));
self.addEventListener('message',event=>{
 if(event.data?.type==='SKIP_WAITING')self.skipWaiting();
 if(event.data?.type==='WARM_CACHE')event.waitUntil(warmOptional());
 if(event.data?.type==='CACHE_STATUS'&&event.ports[0])event.waitUntil(cacheStatus().then(status=>event.ports[0].postMessage(status)));
});
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>{
 const previous=keys.filter(k=>k.startsWith('gtrack-')&&k!==CACHE).sort().reverse();
 return Promise.all(previous.slice(1).map(k=>caches.delete(k)));
}).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
 if(event.request.method!=='GET'||new URL(event.request.url).origin!==BASE.origin)return;
 if(event.request.mode==='navigate'&&new URL(event.request.url).pathname.startsWith(BASE.pathname)){
   event.respondWith(caches.open(CACHE).then(cache=>cache.match(INDEX)).then(hit=>hit||caches.match(INDEX)).then(hit=>hit||fetch(event.request)).catch(()=>new Response('<!doctype html><meta name="viewport" content="width=device-width"><title>GTrack offline</title><main style="font:16px system-ui;max-width:36rem;margin:4rem auto;padding:1rem"><h1>GTrack needs to finish its offline setup.</h1><p>Reconnect once, open GTrack, and leave it open until offline access reports ready.</p></main>',{headers:{'Content-Type':'text/html'}})));return;
 }
 if(ASSETS.has(event.request.url))event.respondWith(caches.open(CACHE).then(async cache=>{
   const hit=await cache.match(event.request,{ignoreVary:true})||await caches.match(event.request,{ignoreVary:true});
   if(hit)return hit;
   const response=await fetch(event.request);
   if(response.ok)await cache.put(event.request,response.clone());
   return response;
 }));
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

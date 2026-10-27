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
const READY=new URL('__gtrack_shell_ready__',BASE).href;
const reloadRequest=url=>new Request(url,{cache:'reload'});
let preferredShells=[];
const shellMetadata=async cache=>{
 const marker=await cache.match(READY);
 if(marker)try{
   const urls=await marker.json();
   if(Array.isArray(urls)&&urls.length)return urls;
 }catch{}
 const index=await cache.match(INDEX);
 if(!index)return null;
 const html=await index.clone().text();
 return [...new Set([INDEX,...Array.from(html.matchAll(/(?:src|href)=["']([^"']+\\.(?:js|css))["']/gi),match=>new URL(match[1],INDEX).href).filter(url=>url.startsWith(BASE.href))])];
};
const completeShellNames=async()=>{
 const keys=(await caches.keys()).filter(key=>key.startsWith('gtrack-'));
 const ordered=[CACHE,...keys.filter(key=>key!==CACHE).sort().reverse()];
 const complete=[];
 for(const name of ordered){
   const cache=await caches.open(name),urls=await shellMetadata(cache);
   if(urls&&(await Promise.all(urls.map(url=>cache.match(url)))).every(Boolean))complete.push(name);
 }
 return complete;
};
const matchInShells=async(names,request)=>{
 for(const name of names){
   const hit=await (await caches.open(name)).match(request,{ignoreVary:true});
   if(hit)return hit;
 }
};
const cacheStatus=()=>caches.open(CACHE).then(cache=>Promise.all(OPTIONAL.map(url=>cache.match(url))).then(hits=>({type:'OFFLINE_CACHE_STATUS',optionalReady:hits.every(Boolean),cachedOptional:hits.filter(Boolean).length,totalOptional:OPTIONAL.length})));
const notifyCacheStatus=()=>cacheStatus().then(status=>clients.matchAll({type:'window',includeUncontrolled:true}).then(items=>items.forEach(client=>client.postMessage(status))));
const warmOptional=()=>caches.open(CACHE).then(cache=>Promise.allSettled(OPTIONAL.map(async url=>{
 if(await cache.match(url))return;
 const response=await fetch(reloadRequest(url));
 if(!response.ok)throw new Error('Could not cache '+url);
 if(response.ok)await cache.put(url,response);
}))).then(notifyCacheStatus);
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(async cache=>{
 await cache.addAll(CORE.map(reloadRequest));
 await cache.put(READY,new Response(JSON.stringify(CORE),{headers:{'Content-Type':'application/json'}}));
})));
self.addEventListener('message',event=>{
 if(event.data?.type==='SKIP_WAITING')self.skipWaiting();
 if(event.data?.type==='WARM_CACHE')event.waitUntil(warmOptional());
 if(event.data?.type==='CACHE_STATUS'&&event.ports[0])event.waitUntil(cacheStatus().then(status=>event.ports[0].postMessage(status)));
});
self.addEventListener('activate',event=>event.waitUntil((async()=>{
 const keys=(await caches.keys()).filter(key=>key.startsWith('gtrack-'));
 const complete=await completeShellNames();
 const previous=complete.filter(name=>name!==CACHE)[0];
 const keep=new Set([CACHE,previous].filter(Boolean));
 await Promise.all(keys.filter(name=>!keep.has(name)).map(name=>caches.delete(name)));
 preferredShells=[];
 await self.clients.claim();
})()));
self.addEventListener('fetch',event=>{
 const url=new URL(event.request.url);
 if(event.request.method!=='GET'||url.origin!==BASE.origin||!url.pathname.startsWith(BASE.pathname))return;
 if(event.request.mode==='navigate'){
   event.respondWith((async()=>{
     preferredShells=await completeShellNames();
     const hit=await matchInShells(preferredShells,INDEX);
     if(hit)return hit;
     try{return await fetch(event.request)}catch{return new Response('<!doctype html><meta name="viewport" content="width=device-width"><title>GTrack offline</title><main style="font:16px system-ui;max-width:36rem;margin:4rem auto;padding:1rem"><h1>GTrack needs to finish its offline setup.</h1><p>Reconnect once, open GTrack, and leave it open until offline access reports ready.</p></main>',{headers:{'Content-Type':'text/html'}})}
   })());return;
 }
 event.respondWith((async()=>{
   const shells=preferredShells.length?preferredShells:await completeShellNames();
   const hit=await matchInShells(shells,event.request);
   if(hit)return hit;
   if(!ASSETS.has(event.request.url))return fetch(event.request);
   const cache=await caches.open(CACHE);
   const response=await fetch(event.request);
   if(response.ok)await cache.put(event.request,response.clone());
   return response;
 })());
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

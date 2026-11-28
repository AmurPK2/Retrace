const CACHE='retrace-phone-journal-070';
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.add('/phone-offline.html')));self.skipWaiting()});
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
// Only the generic offline page is retained. No account, chart, AI or order response is cached.
self.addEventListener('fetch',e=>{if(e.request.mode==='navigate')e.respondWith(fetch(e.request).catch(()=>caches.match('/phone-offline.html')))});

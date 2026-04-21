/* Service worker — offline cache */
const CACHE = 'ugqr7-v1';
const CORE  = ['/', '/index.html', '/manifest.json',
  '/css/main.css', '/css/components.css', '/css/dark.css',
  '/js/config.js', '/js/db.js', '/js/modal.js', '/js/theme.js',
  '/js/ui.js', '/js/auth.js', '/js/session.js',
  '/js/admin.js', '/js/student.js', '/js/app.js'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c=>c.addAll(CORE).catch(()=>{})).then(()=>self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())); });
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (['firebaseio','firebase','gstatic','googleapis','cloudflare','ug.edu.gh'].some(h=>url.hostname.includes(h))) { e.respondWith(fetch(e.request).catch(()=>new Response('{}',{headers:{'Content-Type':'application/json'}}))); return; }
  e.respondWith(caches.match(e.request).then(c => { if(c) return c; return fetch(e.request).then(r => { if(r.ok&&e.request.method==='GET') caches.open(CACHE).then(cache=>cache.put(e.request,r.clone())); return r; }).catch(()=>caches.match('/index.html')); }));
});

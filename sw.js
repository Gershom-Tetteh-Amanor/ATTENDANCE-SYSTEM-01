/* Service worker — offline cache (Fixed - no response cloning issues) */
const CACHE = 'ugqr7-v3';
const CORE = [
  '/index.html', '/manifest.json',
  '/css/main.css', '/css/components.css', '/css/dark.css',
  '/js/config.js', '/js/db.js', '/js/modal.js', '/js/theme.js',
  '/js/ui.js', '/js/auth.js', '/js/session.js',
  '/js/admin.js', '/js/student.js', '/js/student-dashboard.js', '/js/app.js'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE).then(cache => {
      return cache.addAll(CORE).catch(err => {
        console.warn('[SW] Failed to cache some files:', err);
      });
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.filter(key => key !== CACHE).map(key => caches.delete(key))
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  
  // Skip external APIs
  if (url.origin !== location.origin) {
    event.respondWith(fetch(event.request));
    return;
  }
  
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) {
        return cached;
      }
      // Clone the request only once
      const fetchRequest = event.request.clone();
      return fetch(fetchRequest).then(response => {
        if (!response || response.status !== 200) {
          return response;
        }
        // Clone the response before caching
        const responseToCache = response.clone();
        caches.open(CACHE).then(cache => {
          cache.put(event.request, responseToCache);
        });
        return response;
      });
    })
  );
});

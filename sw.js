/* Service worker — offline cache with proper error handling */
const CACHE = 'ugqr7-v5';
const CORE = [
  '/',
  '/index.html',
  '/manifest.json',
  '/uo_ghana.png',
  '/css/main.css',
  '/css/components.css',
  '/css/dark.css',
  '/js/config.js',
  '/js/db.js',
  '/js/modal.js',
  '/js/theme.js',
  '/js/ui.js',
  '/js/auth.js',
  '/js/session.js',
  '/js/admin.js',
  '/js/student.js',
  '/js/student-dashboard.js',
  '/js/reset.js',
  '/js/user-account.js',
  '/js/app.js'
];

// Install event - cache core files
self.addEventListener('install', event => {
  console.log('[SW] Installing new version');
  event.waitUntil(
    caches.open(CACHE).then(cache => {
      return cache.addAll(CORE).catch(err => {
        console.warn('[SW] Failed to cache some files:', err);
        // Continue even if some files fail
      });
    })
  );
  self.skipWaiting();
});

// Activate event - clean up old caches
self.addEventListener('activate', event => {
  console.log('[SW] Activating new version');
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.filter(key => key !== CACHE).map(key => {
          console.log('[SW] Deleting old cache:', key);
          return caches.delete(key);
        })
      );
    })
  );
  self.clients.claim();
});

// Fetch event - serve from cache, fallback to network
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  
  // Handle manifest icon error - return SVG fallback
  if (url.pathname.includes('UG_Logo.png') || (url.pathname.includes('favicon') && event.request.destination === 'image')) {
    event.respondWith(
      fetch(event.request).catch(() => {
        // Return SVG fallback for missing logo
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
          <rect width="100" height="100" fill="#003087" rx="20"/>
          <circle cx="50" cy="40" r="23" fill="none" stroke="#fcd116" stroke-width="3"/>
          <polygon points="50,20 55,35 70,35 58,45 62,60 50,50 38,60 42,45 30,35 45,35" fill="#fcd116"/>
          <text x="50" y="78" font-family="Arial" font-size="10" font-weight="bold" fill="#fcd116" text-anchor="middle">UG</text>
        </svg>`;
        return new Response(svg, {
          headers: { 'Content-Type': 'image/svg+xml' }
        });
      })
    );
    return;
  }
  
  // Skip external APIs and external domains
  if (url.origin !== location.origin) {
    event.respondWith(fetch(event.request));
    return;
  }
  
  // For HTML files, try network first then cache (always get latest)
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).then(response => {
        // Cache the fresh HTML
        const responseClone = response.clone();
        caches.open(CACHE).then(cache => {
          cache.put(event.request, responseClone);
        });
        return response;
      }).catch(() => {
        // Fallback to cached index.html
        return caches.match('/index.html');
      })
    );
    return;
  }
  
  // For other assets (CSS, JS, images), try cache first then network
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) {
        return cached;
      }
      // Clone the request before fetching
      const fetchRequest = event.request.clone();
      return fetch(fetchRequest).then(response => {
        // Don't cache non-successful responses
        if (!response || response.status !== 200) {
          return response;
        }
        // Clone the response before caching
        const responseToCache = response.clone();
        caches.open(CACHE).then(cache => {
          cache.put(event.request, responseToCache);
        });
        return response;
      }).catch(err => {
        console.warn('[SW] Fetch failed for:', event.request.url, err);
        // Return a simple offline page for HTML requests
        if (event.request.headers.get('accept').includes('text/html')) {
          return new Response('<html><body><h1>You are offline</h1><p>Please check your internet connection.</p></body></html>', {
            headers: { 'Content-Type': 'text/html' }
          });
        }
        return new Response('Offline', { status: 503 });
      });
    })
  );
});

// Background sync for failed requests (optional)
self.addEventListener('sync', event => {
  if (event.tag === 'sync-attendance') {
    event.waitUntil(syncAttendance());
  }
});

async function syncAttendance() {
  // Implement background sync for attendance records if needed
  console.log('[SW] Syncing attendance records...');
}

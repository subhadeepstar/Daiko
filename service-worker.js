// service-worker.js

const CACHE_NAME = 'daikufi-cache-v1.1'; // Increment version for updates
const PRECACHE_ASSETS = [
  '/', // Alias for index.html
  '/index.html',
  '/style.css',
  '/script.js',
  // Main app icon
  '/budget.png',
  // Avatar images
  '/image1.png',
  '/image2.png',
  '/image3.png',
  '/image4.png',
  '/image5.png',
  '/image6.png',
  // Bot icon
  '/daiko.png',
  // External libraries (consider caching if critical and not frequently updated by CDN)
  // It's often better to let the browser cache these from CDNs,
  // but if offline capability for these is paramount, you can add them.
  // For example:
  // 'https://fonts.googleapis.com/css2?family=Roboto:wght@400;500;700&display=swap',
  // 'https://cdn.jsdelivr.net/npm/chart.js',
  // 'https://unpkg.com/ml5@latest/dist/ml5.min.js',
  // 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
  // 'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.5.23/jspdf.plugin.autotable.min.js',
  // 'https://unpkg.com/html5-qrcode@2.0.9/dist/html5-qrcode.min.js',
  // 'https://www.gstatic.com/firebasejs/11.8.1/firebase-app-compat.js',
  // 'https://www.gstatic.com/firebasejs/11.8.1/firebase-auth-compat.js',
  // 'https://www.gstatic.com/firebasejs/11.8.1/firebase-firestore-compat.js',
  // 'https://www.gstatic.com/firebasejs/11.8.1/firebase-analytics-compat.js'
];

// Install event: precache core assets
self.addEventListener('install', (event) => {
  console.log('[Service Worker] Install event in progress.');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[Service Worker] Precaching core assets:', PRECACHE_ASSETS);
        // Use addAll for atomic operation. If one fails, all fail.
        // For external URLs, ensure they support CORS or use cache.add() individually with a Request object {mode: 'no-cors'}
        // but 'no-cors' responses are opaque and less useful for actual serving.
        // Best to ensure CDNs have proper CORS or rely on browser caching for them.
        return cache.addAll(PRECACHE_ASSETS.filter(url => !url.startsWith('http'))); // Only cache local assets initially
      })
      .then(() => {
        console.log('[Service Worker] Precache successful. Activating now...');
        return self.skipWaiting(); // Force the waiting service worker to become the active service worker
      })
      .catch(error => {
        console.error('[Service Worker] Precache failed:', error);
      })
  );
});

// Activate event: clean up old caches
self.addEventListener('activate', (event) => {
  console.log('[Service Worker] Activate event in progress.');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('[Service Worker] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      console.log('[Service Worker] Claiming clients.');
      return self.clients.claim(); // Take control of all open clients without waiting for reload
    })
  );
});

// Fetch event: serve assets from cache or network
self.addEventListener('fetch', (event) => {
  // For Firebase and other third-party API calls, usually best to go network-first or network-only.
  // Let Firebase SDK handle its own offline persistence.
  if (event.request.url.includes('firestore.googleapis.com') ||
      event.request.url.includes('firebaseapp.com') ||
      event.request.url.includes('googleusercontent.com') || // For Google Sign-In assets
      event.request.url.includes('googleapis.com/identitytoolkit') || // Firebase Auth
      event.request.url.includes('en.wikipedia.org')) { // Wikipedia API
    event.respondWith(fetch(event.request));
    return;
  }

  // For navigation requests (HTML pages), try network first, then cache.
  // This ensures users get the latest HTML if online, but can still access if offline.
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          // If successful, cache the response for offline use
          if (response.ok) {
            const responseToCache = response.clone();
            caches.open(CACHE_NAME).then(cache => {
              cache.put(event.request, responseToCache);
            });
          }
          return response;
        })
        .catch(() => {
          // If network fails, try to serve from cache
          return caches.match(event.request)
            .then(cachedResponse => {
              return cachedResponse || caches.match('/index.html'); // Fallback to home page
            });
        })
    );
    return;
  }

  // For other static assets (CSS, JS, images), use cache-first strategy.
  event.respondWith(
    caches.match(event.request)
      .then((cachedResponse) => {
        if (cachedResponse) {
          // console.log('[Service Worker] Serving from cache:', event.request.url);
          return cachedResponse;
        }
        // console.log('[Service Worker] Fetching from network and caching:', event.request.url);
        return fetch(event.request).then((networkResponse) => {
          if (networkResponse && networkResponse.ok) {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME)
              .then((cache) => {
                cache.put(event.request, responseToCache);
              });
          }
          return networkResponse;
        }).catch(error => {
          console.error('[Service Worker] Fetch failed for:', event.request.url, error);
          // You could provide a fallback image or generic response here if needed
          // For example, for images: return caches.match('/fallback-image.png');
        });
      })
  );
});

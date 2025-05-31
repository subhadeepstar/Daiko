// service-worker.js

const CACHE_NAME = 'daikufi-cache-v1'; // Updated cache name
const urlsToCache = [
  '/', // Cache the root path
  '/index.html', // Your main HTML file
  '/style.css',  // Your CSS file
  '/script.js',  // Your JavaScript file
  '/manifest.json', // Your manifest file
  '/budget.png',    // Your app icon

  // External libraries (keep if you want them cached by the service worker for app shell)
  // Note: Browsers are also good at caching these, but including them ensures they're part of the SW cache.
  'https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600;700&display=swap', // From your style.css
  'https://fonts.googleapis.com/css2?family=Roboto:wght@400;500;700&display=swap', // From your index.html
  'https://cdn.jsdelivr.net/npm/chart.js',
  'https://unpkg.com/ml5@latest/dist/ml5.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.5.23/jspdf.plugin.autotable.min.js',
  'https://unpkg.com/html5-qrcode@2.0.9/dist/html5-qrcode.min.js'
];

// Install event: Cache core assets
self.addEventListener('install', event => {
  console.log('Service Worker (DaikuFi): Installing...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Service Worker (DaikuFi): Caching app shell');
        
        const cachePromises = urlsToCache.map(urlToCache => {
          // For external URLs (CDNs), fetch with 'reload' to bypass HTTP cache during SW install.
          // For local assets, default cache behavior is usually fine.
          const request = new Request(urlToCache, urlToCache.startsWith('http') ? {cache: 'reload'} : {});
          return fetch(request)
            .then(response => {
              if (!response.ok && urlToCache.startsWith('http')) {
                // Don't fail the entire SW install for a non-critical CDN asset if it fails to fetch initially
                console.warn(`Service Worker (DaikuFi): Failed to fetch and cache ${urlToCache} during install. It might be unavailable offline initially. Status: ${response.status}`);
                return Promise.resolve(); // Resolve promise so other caching can continue
              }
              // If response is OK, or it's a local asset (where fetch might not be needed if already in HTTP cache for SW)
              return cache.put(urlToCache, response);
            })
            .catch(error => {
              console.warn(`Service Worker (DaikuFi): Error caching ${urlToCache}. ${error}`);
              return Promise.resolve(); // Resolve promise so other caching can continue
            });
        });
        return Promise.all(cachePromises);
      })
      .then(() => {
        console.log('Service Worker (DaikuFi): Install completed.');
        return self.skipWaiting(); // Activate the new service worker immediately
      })
      .catch(error => {
        console.error('Service Worker (DaikuFi): Caching failed critically during install:', error);
      })
  );
});

// Activate event: Clean up old caches
self.addEventListener('activate', event => {
  console.log('Service Worker (DaikuFi): Activating...');
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cache => {
          if (cache !== CACHE_NAME) {
            console.log('Service Worker (DaikuFi): Clearing old cache:', cache);
            return caches.delete(cache);
          }
        })
      );
    }).then(() => {
      console.log('Service Worker (DaikuFi): Activated and old caches cleared.');
      return self.clients.claim(); // Take control of all open clients
    })
  );
});

// Fetch event: Serve cached content when offline, or fetch from network
self.addEventListener('fetch', event => {
  const requestUrl = new URL(event.request.url);

  // For navigation requests (e.g., loading index.html or root)
  if (event.request.mode === 'navigate') {
    event.respondWith(
      caches.match(event.request.url, {cacheName: CACHE_NAME}) // Try matching the full URL first
        .then(cachedResponse => {
          if (cachedResponse) return cachedResponse;
          // Fallback to /index.html if the specific navigation URL isn't cached (e.g. for root '/')
          return caches.match('/index.html', {cacheName: CACHE_NAME}).then(indexCache => {
            if(indexCache) return indexCache;
            // If nothing is cached, try network
            return fetch(event.request).catch(() => {
              // Optional: return a generic offline HTML page if network fails
              // return caches.match('/offline.html'); 
              console.error('Service Worker (DaikuFi): Navigate request failed, no cache match.');
            });
          });
        })
    );
    return;
  }

  // Cache-First strategy for assets in our urlsToCache list (or matching by pathname)
  if (urlsToCache.includes(requestUrl.href) || urlsToCache.includes(requestUrl.pathname)) {
    event.respondWith(
      caches.match(event.request, {cacheName: CACHE_NAME}).then(cachedResponse => {
        return cachedResponse || fetch(event.request).then(networkResponse => {
          if (networkResponse && networkResponse.ok) {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then(cache => {
              cache.put(event.request, responseToCache);
            });
          }
          return networkResponse;
        }).catch(error => {
          console.error('Service Worker (DaikuFi): Fetching asset failed:', event.request.url, error);
          // Optionally return a fallback for specific asset types like images
        });
      })
    );
    return;
  }

  // For other requests (e.g., Firebase API calls), go network-first or network-only.
  // The default fetch event behavior is network-only if not intercepted.
  // For robustness, you might implement a network-first, then cache strategy for APIs
  // if you want to cache API responses, but that's more advanced.
  // For now, let non-cached requests pass through to the network.
  // console.log('Service Worker (DaikuFi): Passing through to network:', event.request.url);
  // event.respondWith(fetch(event.request)); // Default behavior, can be omitted.
});

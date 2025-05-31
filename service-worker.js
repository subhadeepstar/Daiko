// service-worker.js

const CACHE_NAME = 'daikufi-cache-v1';
const urlsToCache = [
  '/',
  '/index.html',
  // Add other important assets like CSS, JS, and key images if they are local
  // For example: '/css/style.css', '/js/app.js', '/images/logo.png'
  // Note: The 'budget.png' icon mentioned for the manifest will be cached if it's part of these URLs
  // or fetched and cached on demand if not listed here.
  // For assets loaded from CDNs, the browser's cache or the CDN's caching mechanisms
  // will typically handle them. Service worker caching for CDN assets can be complex
  // due to opaque responses, so it's often omitted for simplicity in basic service workers
  // unless specific offline strategies for them are required.
  'https://fonts.googleapis.com/css2?family=Roboto:wght@400;500;700&display=swap',
  'https://cdn.jsdelivr.net/npm/chart.js',
  'https://unpkg.com/ml5@latest/dist/ml5.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.5.23/jspdf.plugin.autotable.min.js'
];

// Install event: Cache core assets
self.addEventListener('install', event => {
  console.log('Service Worker: Installing...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Service Worker: Caching app shell');
        // Use {cache: 'reload'} for CDN assets to ensure the latest version is fetched during install
        // and not served from the browser's HTTP cache.
        const cachePromises = urlsToCache.map(urlToCache => {
          const request = new Request(urlToCache, {cache: 'reload'});
          return fetch(request).then(response => {
            if (!response.ok && urlToCache.startsWith('http')) { // Only fail hard for CDN assets if fetch fails
                throw new Error(`Failed to fetch ${urlToCache}: ${response.statusText}`);
            }
            // For local assets, or if CDN fetch is okay, cache it.
            // If a CDN asset fails to fetch and it's critical, the install might fail,
            // which is often desired to ensure a working offline version.
            // For non-critical CDN assets, you might want to catch errors individually.
            return cache.put(urlToCache, response);
          }).catch(error => {
            console.warn(`Service Worker: Failed to cache ${urlToCache} during install. It might be unavailable offline initially. Error: ${error}`);
            // Optionally, don't throw error for non-critical CDN assets to allow SW install
          });
        });
        return Promise.all(cachePromises);
      })
      .then(() => {
        console.log('Service Worker: Install completed, app shell cached.');
        return self.skipWaiting(); // Activate the new service worker immediately
      })
      .catch(error => {
        console.error('Service Worker: Caching failed during install:', error);
      })
  );
});

// Activate event: Clean up old caches
self.addEventListener('activate', event => {
  console.log('Service Worker: Activating...');
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cache => {
          if (cache !== CACHE_NAME) {
            console.log('Service Worker: Clearing old cache:', cache);
            return caches.delete(cache);
          }
        })
      );
    }).then(() => {
      console.log('Service Worker: Activated and old caches cleared.');
      return self.clients.claim(); // Take control of all open clients
    })
  );
});

// Fetch event: Serve cached content when offline, or fetch from network
self.addEventListener('fetch', event => {
  // We only want to intercept navigation requests for the app shell (HTML)
  // and requests for assets that are part of our core caching strategy.
  // For other requests (e.g., API calls, external images not in urlsToCache),
  // it's often better to let them go directly to the network,
  // especially if they are POST requests or require fresh data.

  const requestUrl = new URL(event.request.url);

  // For navigation requests (e.g., loading index.html)
  if (event.request.mode === 'navigate') {
    event.respondWith(
      caches.match('/index.html', { cacheName: CACHE_NAME })
        .then(cachedResponse => {
          if (cachedResponse) {
            console.log('Service Worker: Serving from cache (navigate):', event.request.url);
            return cachedResponse;
          }
          console.log('Service Worker: Fetching from network (navigate):', event.request.url);
          return fetch(event.request).catch(error => {
            console.error('Service Worker: Fetch failed (navigate), serving offline page if available.', error);
            // Optionally, return a generic offline page:
            // return caches.match('/offline.html');
          });
        })
    );
    return;
  }

  // For assets in our urlsToCache list (Cache-First strategy)
  if (urlsToCache.includes(requestUrl.href) || urlsToCache.includes(requestUrl.pathname)) {
    event.respondWith(
      caches.match(event.request, { cacheName: CACHE_NAME })
        .then(cachedResponse => {
          if (cachedResponse) {
            console.log('Service Worker: Serving from cache:', event.request.url);
            return cachedResponse;
          }

          // If not in cache, fetch from network, cache it, and then return the response
          console.log('Service Worker: Fetching from network and caching:', event.request.url);
          return fetch(event.request).then(networkResponse => {
            // Check if we received a valid response
            if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic' && !requestUrl.protocol.startsWith('http')) {
              // Don't cache opaque responses unless you know what you're doing (they can take up a lot of space)
              // Also, don't cache if the response was an error.
              return networkResponse;
            }

            // IMPORTANT: Clone the response. A response is a stream
            // and because we want the browser to consume the response
            // as well as the cache consuming the response, we need
            // to clone it so we have two streams.
            const responseToCache = networkResponse.clone();

            caches.open(CACHE_NAME)
              .then(cache => {
                cache.put(event.request, responseToCache);
              });

            return networkResponse;
          }).catch(error => {
            console.error('Service Worker: Fetch failed, serving offline page if available.', error);
            // Optionally, return a fallback for specific assets like images:
            // if (event.request.destination === 'image') {
            //   return caches.match('/fallback-image.png');
            // }
          });
        })
    );
    return;
  }

  // For all other requests, just fetch from the network (Network-First or Network-Only)
  // This ensures that API calls, etc., are not served from cache unless explicitly handled.
  // console.log('Service Worker: Passing through to network:', event.request.url);
  event.respondWith(fetch(event.request));
});

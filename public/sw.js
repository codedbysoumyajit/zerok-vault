// ZeroK Vault Service Worker - World-Class PWA Implementation
// Version 1.0.0

const CACHE_VERSION = 'zerok-vault-v1.0.1';
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const DYNAMIC_CACHE = `${CACHE_VERSION}-dynamic`;
const API_CACHE = `${CACHE_VERSION}-api`;

// Static assets to cache on install
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/offline.html',
  '/style.css',
  '/app.js',
  '/manifest.json',
  '/icons/favicon-96x96.png',
  '/icons/favicon.svg',
  '/icons/apple-touch-icon.png',
  '/icons/web-app-manifest-192x192.png',
  '/icons/web-app-manifest-512x512.png',
  'https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap',
  'https://unpkg.com/@phosphor-icons/web',
  '/icons/key.jpg',
  '/icons/card.jpg',
  '/icons/heart.jpg',
  '/icons/logo-transparent.png',
  '/icons/Screenshot-desktop.png',
  '/icons/Screenshot-mobile.png',
  '/icons/favicon.ico'
];

// Maximum cache sizes
const MAX_DYNAMIC_CACHE_SIZE = 50;
const MAX_API_CACHE_SIZE = 30;
const CACHE_EXPIRY_TIME = 7 * 24 * 60 * 60 * 1000; // 7 days

// ========================
// INSTALL EVENT
// ========================
self.addEventListener('install', (event) => {
  console.log('[ServiceWorker] Installing...');
  
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) => {
        console.log('[ServiceWorker] Pre-caching static assets');
        return cache.addAll(STATIC_ASSETS.map(url => new Request(url, { cache: 'reload' })));
      })
      .then(() => {
        console.log('[ServiceWorker] Static assets cached successfully');
        return self.skipWaiting(); // Activate immediately
      })
      .catch((error) => {
        console.error('[ServiceWorker] Pre-caching failed:', error);
      })
  );
});

// ========================
// ACTIVATE EVENT
// ========================
self.addEventListener('activate', (event) => {
  console.log('[ServiceWorker] Activating...');
  
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames
            .filter((cacheName) => {
              // Delete old caches
              return cacheName.startsWith('zerok-vault-') && cacheName !== STATIC_CACHE && cacheName !== DYNAMIC_CACHE && cacheName !== API_CACHE;
            })
            .map((cacheName) => {
              console.log('[ServiceWorker] Deleting old cache:', cacheName);
              return caches.delete(cacheName);
            })
        );
      })
      .then(() => {
        console.log('[ServiceWorker] Activated successfully');
        return self.clients.claim(); // Take control immediately
      })
  );
});

// ========================
// FETCH EVENT
// ========================
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') {
    return;
  }

  // Special handling for navigation requests (page loads)
  if (request.mode === 'navigate' || request.destination === 'document') {
    event.respondWith(
      fetch(request, { cache: 'no-store' })
        .then(response => {
          // Clone response before using it
          const responseClone = response.clone();
          
          // Cache successful navigation
          if (response && response.status === 200) {
            caches.open(DYNAMIC_CACHE).then(cache => {
              cache.put(request, responseClone);
            });
          }
          return response;
        })
        .catch(() => {
          // Network failed - show offline page
          return caches.match('/offline.html')
            .then(offlineResponse => {
              if (offlineResponse) {
                return offlineResponse;
              }
              // Fallback to cached index.html if offline.html is not available
              return caches.match('/index.html');
            });
        })
    );
    return;
  }

  // Handle different request types with appropriate strategies
  if (isAPIRequest(url)) {
    event.respondWith(networkFirstStrategy(request, API_CACHE));
  } else if (isStaticAsset(url)) {
    event.respondWith(cacheFirstStrategy(request, STATIC_CACHE));
  } else if (isExternalResource(url)) {
    event.respondWith(staleWhileRevalidateStrategy(request, DYNAMIC_CACHE));
  } else {
    event.respondWith(cacheFirstStrategy(request, DYNAMIC_CACHE));
  }
});

// ========================
// CACHING STRATEGIES
// ========================

// Cache First (for static assets)
async function cacheFirstStrategy(request, cacheName) {
  try {
    const cachedResponse = await caches.match(request);
    
    if (cachedResponse) {
      // Check if cache is expired
      const cacheTime = await getCacheTimestamp(request.url);
      if (cacheTime && Date.now() - cacheTime > CACHE_EXPIRY_TIME) {
        // Cache expired, fetch new version in background
        fetchAndCache(request, cacheName);
      }
      return cachedResponse;
    }

    const networkResponse = await fetch(request);
    
    if (networkResponse && networkResponse.status === 200) {
      await cacheResponse(request, networkResponse.clone(), cacheName);
    }
    
    return networkResponse;
  } catch (error) {
    console.error('[ServiceWorker] Cache-first strategy failed:', error);
    
    // Return offline page for navigation requests
    if (request.mode === 'navigate' || request.destination === 'document') {
      const offlineResponse = await caches.match('/offline.html');
      if (offlineResponse) {
        return offlineResponse;
      }
    }
    
    return new Response('Offline - Please check your connection', {
      status: 503,
      statusText: 'Service Unavailable',
      headers: new Headers({
        'Content-Type': 'text/plain'
      })
    });
  }
}

// Network First (for API requests)
async function networkFirstStrategy(request, cacheName) {
  try {
    const networkResponse = await fetch(request);
    
    if (networkResponse && networkResponse.status === 200) {
      await cacheResponse(request, networkResponse.clone(), cacheName);
      trimCache(cacheName, MAX_API_CACHE_SIZE);
    }
    
    return networkResponse;
  } catch (error) {
    console.log('[ServiceWorker] Network failed, trying cache:', request.url);
    
    const cachedResponse = await caches.match(request);
    
    if (cachedResponse) {
      return cachedResponse;
    }
    
    // Return offline page for navigation requests
    if (request.mode === 'navigate' || request.destination === 'document') {
      const offlineResponse = await caches.match('/offline.html');
      if (offlineResponse) {
        return offlineResponse;
      }
    }
    
    return new Response(JSON.stringify({ error: 'Offline' }), {
      status: 503,
      statusText: 'Service Unavailable',
      headers: new Headers({
        'Content-Type': 'application/json'
      })
    });
  }
}

// Stale While Revalidate (for external resources)
async function staleWhileRevalidateStrategy(request, cacheName) {
  const cachedResponse = await caches.match(request);
  
  const fetchPromise = fetch(request)
    .then((networkResponse) => {
      if (networkResponse && networkResponse.status === 200) {
        cacheResponse(request, networkResponse.clone(), cacheName);
        trimCache(cacheName, MAX_DYNAMIC_CACHE_SIZE);
      }
      return networkResponse;
    })
    .catch(() => {
      // Network failed, return cached response
      return cachedResponse;
    });
  
  return cachedResponse || fetchPromise;
}

// ========================
// HELPER FUNCTIONS
// ========================

function isAPIRequest(url) {
  return url.pathname.startsWith('/api/');
}

function isStaticAsset(url) {
  const staticExtensions = ['.css', '.js', '.png', '.jpg', '.jpeg', '.svg', '.webp', '.ico', '.woff', '.woff2', '.ttf'];
  return staticExtensions.some(ext => url.pathname.endsWith(ext)) || url.pathname === '/';
}

function isExternalResource(url) {
  return url.origin !== self.location.origin;
}

async function cacheResponse(request, response, cacheName) {
  const cache = await caches.open(cacheName);
  await cache.put(request, response);
  await setCacheTimestamp(request.url);
}

async function fetchAndCache(request, cacheName) {
  try {
    const response = await fetch(request);
    if (response && response.status === 200) {
      await cacheResponse(request, response.clone(), cacheName);
    }
  } catch (error) {
    console.log('[ServiceWorker] Background fetch failed:', error);
  }
}

async function trimCache(cacheName, maxItems) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  
  if (keys.length > maxItems) {
    const itemsToDelete = keys.length - maxItems;
    for (let i = 0; i < itemsToDelete; i++) {
      await cache.delete(keys[i]);
    }
  }
}

async function setCacheTimestamp(url) {
  const cache = await caches.open('cache-timestamps');
  await cache.put(url, new Response(JSON.stringify({ timestamp: Date.now() })));
}

async function getCacheTimestamp(url) {
  try {
    const cache = await caches.open('cache-timestamps');
    const response = await cache.match(url);
    if (response) {
      const data = await response.json();
      return data.timestamp;
    }
  } catch (error) {
    return null;
  }
  return null;
}

// ========================
// BACKGROUND SYNC
// ========================
self.addEventListener('sync', (event) => {
  console.log('[ServiceWorker] Background sync:', event.tag);
  
  if (event.tag === 'sync-vault-data') {
    event.waitUntil(syncVaultData());
  }
});

async function syncVaultData() {
  console.log('[ServiceWorker] Syncing vault data...');
  // Implement vault sync logic here if needed
  return Promise.resolve();
}

// ========================
// PUSH NOTIFICATIONS
// ========================
self.addEventListener('push', (event) => {
  const data = event.data ? event.data.json() : {};
  const title = data.title || 'ZeroK Vault';
  const options = {
    body: data.body || 'You have a new notification',
    icon: '/icons/web-app-manifest-192x192.png',
    badge: '/icons/favicon-96x96.png',
    vibrate: [200, 100, 200],
    data: data,
    tag: 'zerok-vault-notification',
    requireInteraction: false
  };

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        // Focus existing window if available
        for (let client of clientList) {
          if (client.url === '/' && 'focus' in client) {
            return client.focus();
          }
        }
        // Open new window if none exists
        if (clients.openWindow) {
          return clients.openWindow('/');
        }
      })
  );
});

// ========================
// PERIODIC BACKGROUND SYNC
// ========================
self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'cache-refresh') {
    event.waitUntil(refreshCache());
  }
});

async function refreshCache() {
  console.log('[ServiceWorker] Refreshing cache...');
  const cache = await caches.open(STATIC_CACHE);
  
  for (const url of STATIC_ASSETS) {
    try {
      const response = await fetch(url, { cache: 'reload' });
      if (response && response.status === 200) {
        await cache.put(url, response);
      }
    } catch (error) {
      console.log('[ServiceWorker] Failed to refresh:', url);
    }
  }
}

// ========================
// MESSAGE HANDLING
// ========================
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  
  if (event.data && event.data.type === 'CACHE_CLEAR') {
    event.waitUntil(
      caches.keys().then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => caches.delete(cacheName))
        );
      })
    );
  }
  
  if (event.data && event.data.type === 'CACHE_UPDATE') {
    event.waitUntil(refreshCache());
  }
});

console.log('[ServiceWorker] Service Worker loaded successfully');

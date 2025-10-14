const CACHE_NAME = 'mikrotik-billing-v1.0.0';
const RUNTIME_CACHE = 'mikrotik-billing-runtime-v1.0.0';

// Critical resources that should be cached immediately
const STATIC_CACHE_URLS = [
    '/',
    '/public/css/main.css',
    '/public/js/main.js',
    '/public/js/app.js',
    '/public/images/icons/icon-16x16.svg',
    '/public/images/icons/icon-32x32.svg',
    '/public/images/icons/icon-192x192.svg',
    '/public/images/icons/icon-512x512.svg',
    'https://cdnjs.cloudflare.com/ajax/libs/tailwindcss/2.2.19/tailwind.min.css',
    'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
    'https://cdnjs.cloudflare.com/ajax/libs/htmx/1.9.10/htmx.min.js'
];

// API endpoints that can be cached for offline use
const CACHEABLE_API_PATTERNS = [
    '/api/public/system/status',
    '/api/public/profiles/list',
    '/api/dashboard/stats'
];

// Install event - cache critical resources
self.addEventListener('install', event => {
    console.log('Service Worker: Installing...');

    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                console.log('Service Worker: Caching static resources');
                return cache.addAll(STATIC_CACHE_URLS);
            })
            .then(() => {
                console.log('Service Worker: Static resources cached successfully');
                return self.skipWaiting();
            })
            .catch(error => {
                console.error('Service Worker: Failed to cache static resources', error);
            })
    );
});

// Activate event - clean up old caches
self.addEventListener('activate', event => {
    console.log('Service Worker: Activating...');

    event.waitUntil(
        caches.keys()
            .then(cacheNames => {
                return Promise.all(
                    cacheNames.map(cacheName => {
                        if (cacheName !== CACHE_NAME && cacheName !== RUNTIME_CACHE) {
                            console.log('Service Worker: Deleting old cache:', cacheName);
                            return caches.delete(cacheName);
                        }
                    })
                );
            })
            .then(() => {
                console.log('Service Worker: Activated successfully');
                return self.clients.claim();
            })
    );
});

// Fetch event - implement caching strategies
self.addEventListener('fetch', event => {
    const { request } = event;
    const url = new URL(request.url);

    // Skip non-GET requests
    if (request.method !== 'GET') {
        return;
    }

    // Skip external requests (except CDN)
    if (url.origin !== self.location.origin &&
        !url.hostname.includes('cdnjs.cloudflare.com') &&
        !url.hostname.includes('fonts.googleapis.com') &&
        !url.hostname.includes('fonts.gstatic.com')) {
        return;
    }

    // Route requests to appropriate caching strategy
    if (STATIC_CACHE_URLS.includes(url.pathname)) {
        // Cache first for static resources
        event.respondWith(cacheFirst(request));
    } else if (isCacheableAPI(url.pathname)) {
        // Network first with cache fallback for API calls
        event.respondWith(networkFirst(request));
    } else if (url.pathname.startsWith('/public/')) {
        // Cache first for static assets
        event.respondWith(cacheFirst(request));
    } else if (url.pathname === '/') {
        // Cache first for the main page
        event.respondWith(cacheFirst(request));
    } else {
        // Network first for everything else
        event.respondWith(networkFirst(request));
    }
});

// Cache First Strategy
async function cacheFirst(request) {
    try {
        const cachedResponse = await caches.match(request);

        if (cachedResponse) {
            // Return cached response immediately
            return cachedResponse;
        }

        // Try to fetch from network
        const networkResponse = await fetch(request);

        if (networkResponse.ok) {
            // Cache the successful response
            const cache = await caches.open(RUNTIME_CACHE);
            cache.put(request, networkResponse.clone());
        }

        return networkResponse;
    } catch (error) {
        console.error('Cache First failed:', error);

        // Try to return any cached response as fallback
        const cachedResponse = await caches.match(request);
        if (cachedResponse) {
            return cachedResponse;
        }

        // Return offline fallback page if available
        return caches.match('/offline.html') || new Response('Offline', {
            status: 503,
            statusText: 'Service Unavailable'
        });
    }
}

// Network First Strategy
async function networkFirst(request) {
    try {
        const networkResponse = await fetch(request);

        if (networkResponse.ok) {
            // Cache successful response
            const cache = await caches.open(RUNTIME_CACHE);
            cache.put(request, networkResponse.clone());
        }

        return networkResponse;
    } catch (error) {
        console.error('Network First failed:', error);

        // Try to return cached response as fallback
        const cachedResponse = await caches.match(request);
        if (cachedResponse) {
            return cachedResponse;
        }

        // Return appropriate fallback for API requests
        if (request.url.includes('/api/')) {
            return new Response(JSON.stringify({
                error: 'Network unavailable',
                offline: true,
                message: 'This request failed because you are offline'
            }), {
                status: 503,
                statusText: 'Service Unavailable',
                headers: {
                    'Content-Type': 'application/json'
                }
            });
        }

        // Return offline page for navigation requests
        return caches.match('/offline.html') || new Response('Offline', {
            status: 503,
            statusText: 'Service Unavailable'
        });
    }
}

// Stale While Revalidate Strategy
async function staleWhileRevalidate(request) {
    const cache = await caches.open(RUNTIME_CACHE);
    const cachedResponse = await cache.match(request);

    const fetchPromise = fetch(request).then(networkResponse => {
        if (networkResponse.ok) {
            cache.put(request, networkResponse.clone());
        }
        return networkResponse;
    });

    // Return cached response immediately if available
    if (cachedResponse) {
        return cachedResponse;
    }

    // Otherwise wait for network response
    return fetchPromise;
}

// Check if URL is cacheable API
function isCacheableAPI(pathname) {
    return CACHEABLE_API_PATTERNS.some(pattern => {
        if (pattern.includes('*')) {
            const regex = new RegExp(pattern.replace('*', '.*'));
            return regex.test(pathname);
        }
        return pathname === pattern;
    });
}

// Background sync for offline actions
self.addEventListener('sync', event => {
    console.log('Service Worker: Background sync triggered', event.tag);

    if (event.tag === 'background-sync') {
        event.waitUntil(doBackgroundSync());
    }
});

async function doBackgroundSync() {
    try {
        // Get all queued requests from IndexedDB
        const queuedRequests = await getQueuedRequests();

        for (const request of queuedRequests) {
            try {
                // Retry the request
                const response = await fetch(request.url, request.options);

                if (response.ok) {
                    // Remove successful request from queue
                    await removeQueuedRequest(request.id);
                    console.log('Background sync: Request successful', request.url);
                }
            } catch (error) {
                console.error('Background sync: Request failed', request.url, error);
            }
        }

        // Notify all clients about sync completion
        const clients = await self.clients.matchAll();
        clients.forEach(client => {
            client.postMessage({
                type: 'BACKGROUND_SYNC_COMPLETED',
                success: true,
                timestamp: Date.now()
            });
        });

    } catch (error) {
        console.error('Background sync failed:', error);
    }
}

// Push notifications
self.addEventListener('push', event => {
    console.log('Service Worker: Push received');

    const options = {
        body: event.data ? event.data.text() : 'New notification',
        icon: '/public/images/icons/wifi-icon.svg',
        badge: '/public/images/icons/badge.svg',
        vibrate: [100, 50, 100],
        data: {
            dateOfArrival: Date.now(),
            primaryKey: 1
        },
        actions: [
            {
                action: 'explore',
                title: 'Explore',
                icon: '/public/images/icons/checkmark.svg'
            },
            {
                action: 'close',
                title: 'Close',
                icon: '/public/images/icons/xmark.svg'
            }
        ]
    };

    event.waitUntil(
        self.registration.showNotification('Mikrotik Billing', options)
    );
});

// Handle notification clicks
self.addEventListener('notificationclick', event => {
    console.log('Service Worker: Notification click received');

    event.notification.close();

    if (event.action === 'explore') {
        // Open the app to relevant page
        event.waitUntil(
            clients.openWindow('/')
        );
    }
});

// Periodic background sync for cache updates
self.addEventListener('periodicsync', event => {
    console.log('Service Worker: Periodic sync triggered', event.tag);

    if (event.tag === 'cache-update') {
        event.waitUntil(updateCache());
    }
});

async function updateCache() {
    try {
        // Update critical static resources
        const cache = await caches.open(CACHE_NAME);

        for (const url of STATIC_CACHE_URLS) {
            try {
                const response = await fetch(url);
                if (response.ok) {
                    await cache.put(url, response);
                }
            } catch (error) {
                console.warn('Failed to update cache resource:', url, error);
            }
        }

        console.log('Service Worker: Cache update completed');
    } catch (error) {
        console.error('Service Worker: Cache update failed:', error);
    }
}

// IndexedDB helpers for offline queue
function getQueuedRequests() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open('OfflineQueue', 1);

        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
            const db = request.result;
            const transaction = db.transaction(['requests'], 'readonly');
            const store = transaction.objectStore('requests');
            const getAllRequest = store.getAll();

            getAllRequest.onsuccess = () => resolve(getAllRequest.result);
            getAllRequest.onerror = () => reject(getAllRequest.error);
        };

        request.onupgradeneeded = () => {
            const db = request.result;
            const store = db.createObjectStore('requests', { keyPath: 'id', autoIncrement: true });
            store.createIndex('timestamp', 'timestamp', { unique: false });
        };
    });
}

function removeQueuedRequest(id) {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open('OfflineQueue', 1);

        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
            const db = request.result;
            const transaction = db.transaction(['requests'], 'readwrite');
            const store = transaction.objectStore('requests');
            const deleteRequest = store.delete(id);

            deleteRequest.onsuccess = () => resolve();
            deleteRequest.onerror = () => reject(deleteRequest.error);
        };
    });
}

// Message handling from clients
self.addEventListener('message', event => {
    console.log('Service Worker: Message received', event.data);

    if (event.data && event.data.type) {
        switch (event.data.type) {
            case 'SKIP_WAITING':
                self.skipWaiting();
                break;

            case 'CACHE_UPDATE':
                updateCache();
                break;

            case 'CLEAR_CACHE':
                clearCaches();
                break;

            default:
                console.log('Service Worker: Unknown message type', event.data.type);
        }
    }
});

async function clearCaches() {
    try {
        const cacheNames = await caches.keys();
        await Promise.all(
            cacheNames.map(cacheName => caches.delete(cacheName))
        );
        console.log('Service Worker: All caches cleared');
    } catch (error) {
        console.error('Service Worker: Failed to clear caches', error);
    }
}
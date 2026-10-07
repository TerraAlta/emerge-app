// Offline shell for the installable app.
//
// Network first, cache as a fallback — but ONLY for Emerge's own pages and
// static files. Until v4 this cached every GET, including cross-origin
// Supabase reads (profiles, journal entries, support tickets), map tiles and
// geocoder calls, so private data stayed in Cache Storage after sign-out and
// the cache grew without limit. Bumping the version deletes those old caches.
const CACHE_NAME = 'emerge-v4';
const PRECACHE_URLS = [
  '/',
  '/manifest.json',
  '/icons/icon-192.svg',
  '/icons/icon-512.svg',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

function cacheable(request) {
  if (request.method !== 'GET') return false;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return false; // never other sites' data
  if (url.pathname.startsWith('/api/')) return false;    // never API responses
  if (url.pathname.startsWith('/auth/')) return false;
  return true;
}

self.addEventListener('fetch', (event) => {
  if (!cacheable(event.request)) return; // let the browser handle it normally

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response.ok && response.type === 'basic') {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});

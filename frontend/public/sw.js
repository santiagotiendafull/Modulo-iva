// Service worker del Módulo IVA. Solo cachea la "cáscara" de la app (HTML, JS, CSS, íconos) para que
// abra rápido y se pueda instalar. NUNCA toca /api: son datos fiscales y llevan el token de sesión,
// siempre tienen que ir a la red. Sin conexión la app abre, pero las pantallas muestran el error de red.
const VERSION = 'v1';
const CACHE = `modulo-iva-${VERSION}`;
const CASCARA = ['/', '/manifest.webmanifest', '/favicon.svg', '/logo-tiendafull.svg', '/icons/icon-192.png', '/icons/icon-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(CASCARA)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((claves) => Promise.all(claves.filter((c) => c.startsWith('modulo-iva-') && c !== CACHE).map((c) => caches.delete(c))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api')) return;

  // Navegación: red primero (así un deploy nuevo se ve enseguida) y, si no hay red, la cáscara guardada.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copia = res.clone();
          caches.open(CACHE).then((cache) => cache.put('/', copia));
          return res;
        })
        .catch(() => caches.match('/'))
    );
    return;
  }

  // Assets con hash en el nombre (/assets/*): nunca cambian, así que caché primero.
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(
      caches.match(request).then((hit) => hit || fetch(request).then((res) => {
        if (res.ok) {
          const copia = res.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copia));
        }
        return res;
      }))
    );
    return;
  }

  // Resto (íconos, logo, manifest): lo guardado al instante y se refresca en segundo plano.
  event.respondWith(
    caches.match(request).then((hit) => {
      const red = fetch(request).then((res) => {
        if (res.ok) {
          const copia = res.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copia));
        }
        return res;
      });
      return hit || red;
    })
  );
});

/* 碎页集 — 离线缓存
 * 只缓存本站静态文件；卡片数据本来就在 localStorage 里。
 */
const CACHE = 'suiyeji-v1.0.2';
const CORE = [
  './',
  './index.html',
  './404.html',
  './favicon.svg',
  './manifest.webmanifest',
  './assets/css/style.css',
  './assets/js/data.js',
  './assets/js/markdown.js',
  './assets/js/store.js',
  './assets/js/importer.js',
  './assets/js/share.js',
  './assets/js/app.js',
  './assets/img/og-cover.png',
  './assets/img/icon-180.png',
  './assets/img/icon-192.png',
  './assets/img/icon-512.png'
];

function cacheAsset(cache, url) {
  return new Promise((resolve) => {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      controller.abort();
      resolve(false);
    }, 8000);
    fetch(url, { signal: controller.signal, cache: 'reload' })
      .then((response) => {
        clearTimeout(timer);
        if (!response || !response.ok) {
          resolve(false);
          return;
        }
        return cache.put(url, response).then(() => resolve(true)).catch(() => resolve(false));
      })
      .catch(() => {
        clearTimeout(timer);
        resolve(false);
      });
  });
}

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // 逐个容错，避免某个 CDN 请求卡住整套离线缓存。
    await Promise.all(CORE.map((url) => cacheAsset(cache, url)));
    await Promise.race([
      self.skipWaiting(),
      new Promise((resolve) => setTimeout(resolve, 1500))
    ]);
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))
    )).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).then((response) => {
        const copy = response.clone();
        caches.open(CACHE).then((cache) => cache.put(request, copy)).catch(() => {});
        return response;
      }).catch(() => caches.match(request).then((cached) => cached || caches.match('./index.html')))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        if (response && response.ok) {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy)).catch(() => {});
        }
        return response;
      });
    })
  );
});

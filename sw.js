/* 碎页集 — 离线缓存
 * 只缓存本站静态文件；卡片数据本来就在 localStorage 里。
 */
const CACHE = 'suiyeji-v1.0.3';
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
      resolve({ url, ok: false, error: 'timeout' });
    }, 20000);
    fetch(url, { signal: controller.signal, cache: 'reload' })
      .then((response) => {
        clearTimeout(timer);
        if (!response || !response.ok) {
          resolve({ url, ok: false, status: response ? response.status : 0 });
          return;
        }
        return cache.put(url, response)
          .then(() => resolve({ url, ok: true, status: response.status }))
          .catch((error) => resolve({ url, ok: false, error: String(error) }));
      })
      .catch((error) => {
        clearTimeout(timer);
        resolve({ url, ok: false, error: String(error) });
      });
  });
}

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    const log = [];
    // 串行缓存，避免 GitHub Pages/HTTP2 并发限制导致部分资源超时。
    for (const url of CORE) {
      log.push(await cacheAsset(cache, url));
    }
    try {
      await cache.put('./__sw-status', new Response(JSON.stringify(log), {
        headers: { 'content-type': 'application/json' }
      }));
    } catch (error) { /* 诊断信息写不进去也不影响站点 */ }
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

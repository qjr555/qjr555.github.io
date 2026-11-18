/* 碎页集 — 旧版 Service Worker 清理脚本
 * 早期版本尝试过离线缓存，但在 GitHub Pages 上安装不稳定。
 * 这个脚本会删除旧缓存、注销自身，然后让页面回到普通网络加载。
 */
const LEGACY_PREFIX = 'suiyeji-';

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys.filter((key) => key.indexOf(LEGACY_PREFIX) === 0).map((key) => caches.delete(key))
    );
    await self.registration.unregister();
    const clients = await self.clients.matchAll({ type: 'window' });
    clients.forEach((client) => {
      try { client.navigate(client.url); } catch (error) { /* 忽略无法刷新的窗口 */ }
    });
  })());
});

self.addEventListener('fetch', () => {
  // 不拦截请求，交给网络。
});

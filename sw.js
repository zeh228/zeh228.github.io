// 四季幻境 Service Worker:离线缓存(APP 模式)
// v2:代码/配置网络优先(保证更新及时),大图缓存优先(保证离线可用)
const CACHE = 'siji-v2';
const CORE = [
  './index.html',
  './pano.js',
  './scenes.json',
  './manifest.webmanifest',
  './lib/three.module.js',
  './lib/OrbitControls.js',
  './icon-192.png',
  './icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE)));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  // 清掉旧版本缓存,立即接管页面
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return;

  // 大图(全景底图/图标):缓存优先,看过一次即离线可用
  if (/\.(jpg|jpeg|png)$/i.test(url.pathname)) {
    e.respondWith(
      caches.match(e.request).then((hit) => {
        if (hit) return hit;
        return fetch(e.request).then((res) => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(CACHE).then((c) => c.put(e.request, clone));
          }
          return res;
        });
      })
    );
    return;
  }

  // 页面/脚本/配置:网络优先,断网时回退缓存
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        if (res.ok) {
          const clone = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, clone));
        }
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});

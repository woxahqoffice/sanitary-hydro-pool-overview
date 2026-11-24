/* ใช้เน็ตก่อนเสมอ (หน้าเว็บอัปเดตทันที) ถ้าไม่มีสัญญาณค่อยเปิดจากที่เก็บไว้ */
const C = 'water2b-v1';
const CORE = ['./', 'index.html', 'water.html', 'pumps.html', 'sanitary.html', 'plan.html', 'equipment.html', 'sim.html', 'common.css', 'mobile.css', 'mobile.js', 'sim.js', 'three.min.js', 'OrbitControls.js', 'icon-192.png'];
self.addEventListener('install', (e) => { self.skipWaiting(); e.waitUntil(caches.open(C).then((c) => c.addAll(CORE)).catch(() => {})); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((k) => Promise.all(k.filter((x) => x !== C).map((x) => caches.delete(x)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', (e) => {
  const r = e.request; if (r.method !== 'GET' || new URL(r.url).origin !== location.origin || /\.mp4$/.test(r.url)) return;
  e.respondWith(fetch(r).then((res) => { const cp = res.clone(); caches.open(C).then((c) => c.put(r, cp)); return res; }).catch(() => caches.match(r).then((m) => m || caches.match('index.html'))));
});

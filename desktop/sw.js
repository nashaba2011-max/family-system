/* عامل الخدمة: يحفظ ملفات البرنامج على الجهاز ليعمل بدون إنترنت */
const VERSION = "ft-desktop-fde603a78f";
const FILES = ["./", "css/app.css", "css/offline.css", "fonts/Amiri-Bold.ttf", "fonts/Amiri-Regular.ttf", "fonts/OFL.txt", "fonts/Tajawal-Bold.ttf", "fonts/Tajawal-ExtraBold.ttf", "fonts/Tajawal-Medium.ttf", "fonts/Tajawal-Regular.ttf", "icon.svg", "img/apple-touch-icon.png", "img/favicon-64.png", "img/icon-192.png", "img/icon-512.png", "img/logo-full-light.png", "img/logo-full.png", "img/logo-mark-light.png", "img/logo-mark.png", "index.html", "js/app.js", "js/bday.js", "js/config.js", "js/core.js", "js/events.js", "js/gate.js", "js/heritage.js", "js/join.js", "js/kinship.js", "js/market.js", "js/offline/localdb.js", "js/offline/ui.js", "js/qr.js", "js/record.js", "js/reports.js", "js/sound.js", "js/tools.js", "js/vendor/qrcode.js", "manifest.json", "manifest.webmanifest", "vendor/xlsx.full.min.js"];
self.addEventListener("install", e => { e.waitUntil(caches.open(VERSION).then(c => c.addAll(FILES.map(f => new Request(f, {cache:"reload"})))).then(() => self.skipWaiting())); });
self.addEventListener("activate", e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", e => {
  const u = new URL(e.request.url);
  if(e.request.method !== "GET" || u.origin !== location.origin) return; // الاتصال بالموقع يمر مباشرة
  e.respondWith(caches.match(e.request, {ignoreSearch:true}).then(r => r || fetch(e.request).then(res => { if(res.ok){ const cp = res.clone(); caches.open(VERSION).then(c => c.put(e.request, cp)); } return res; }).catch(() => caches.match("./index.html"))));
});

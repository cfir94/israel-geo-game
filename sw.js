/* =============================================================
   Service Worker – המשחק עובד בלי רשת.

   כל הקבצים הם סטטיים וקטנים (כחצי מגה בסך הכול, בלי אף בקשה
   חיצונית), ולכן פשוט שומרים את כולם במטמון בהתקנה. זה מה
   שמאפשר לפתוח את המשחק בשטח, באזור בלי קליטה.

   האסטרטגיה: רשת קודם ואז מטמון (network-first). כך גרסה
   חדשה נתפסת מיד כשיש רשת, ובלי רשת עובדים מהמטמון.
   פניות ל-Supabase לא נוגעות במטמון כלל.
   ============================================================= */

/* מעלים את המספר בכל שינוי ברשימה, אחרת מטמון ישן שורד את העדכון */
const VERSION = 'geo-game-v5';
const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/fonts.css',
  './css/style.css',
  './js/config.js',
  './js/cloud.js',
  './js/geo.js',
  './js/data.js',
  './js/geology.js',
  './js/guide.js',
  './js/routes.js',
  './js/structure.js',
  './js/history.js',
  './js/periods.js',
  './js/build.js',
  './js/social.js',
  './js/map.js',
  './js/game.js',
  './assets/icon.png'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(VERSION)
      .then(c => c.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  /* רק הקבצים של המשחק. חשבונות וסנכרון תמיד ישירות לרשת. */
  if (url.origin !== self.location.origin) return;

  e.respondWith(
    fetch(req)
      .then(res => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(VERSION).then(c => c.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req).then(hit => hit || caches.match('./index.html')))
  );
});

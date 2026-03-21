// Rada Service Worker
const CACHE_NAME = 'rada-v1';
let reminders = [];
let lastFired = {};

self.addEventListener('install', e => {
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(clients.claim());
});

// Receive reminders from the app
self.addEventListener('message', e => {
  if (e.data?.type === 'UPDATE_REMINDERS') {
    reminders = e.data.reminders || [];
    // Store in cache so they survive SW restart
    caches.open(CACHE_NAME).then(cache => {
      const data = JSON.stringify(reminders);
      cache.put('reminders-data', new Response(data));
    });
  }
  if (e.data?.type === 'CHECK_NOW') {
    loadAndCheck();
  }
});

// Load reminders from cache (survives SW sleep)
async function loadReminders() {
  try {
    const cache = await caches.open(CACHE_NAME);
    const res = await cache.match('reminders-data');
    if (res) reminders = JSON.parse(await res.text());
    const fired = await cache.match('last-fired');
    if (fired) lastFired = JSON.parse(await fired.text());
  } catch(e) {}
}

async function saveLastFired() {
  const cache = await caches.open(CACHE_NAME);
  cache.put('last-fired', new Response(JSON.stringify(lastFired)));
}

async function loadAndCheck() {
  await loadReminders();
  checkReminders();
}

function checkReminders() {
  if (!reminders.length) return;
  const now = new Date();
  const dow = now.getDay();
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  const currentTime = hh + ':' + mm;
  const today = now.toISOString().slice(0, 10);

  reminders.forEach(r => {
    if (!r.enabled) return;
    const shouldFire = (
      r.repeat === 'daily' ||
      (r.repeat === 'weekdays' && dow >= 1 && dow <= 5) ||
      (r.repeat === 'weekends' && (dow === 0 || dow === 6)) ||
      r.repeat === 'once'
    );
    if (!shouldFire) return;
    const times = r.times || (r.time ? [r.time] : []);
    times.forEach(t => {
      const key = r.id + '_' + t;
      if (t === currentTime && lastFired[key] !== today) {
        lastFired[key] = today;
        saveLastFired();
        self.registration.showNotification(r.icon + ' ' + r.name, {
          body: 'Your reminder: ' + r.name,
          tag: 'rada-' + r.id + '-' + t,
          renotify: true,
          vibrate: [200, 100, 200],
          icon: '/icon-192.png',
          data: { url: '/' }
        });
      }
    });
  });
}

// Wake up every minute via fetch interception to check reminders
self.addEventListener('fetch', e => {
  if (e.request.url.includes('rada-tick')) {
    loadAndCheck();
    e.respondWith(new Response('ok'));
    return;
  }
  e.respondWith(fetch(e.request).catch(() => new Response('offline')));
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(
    clients.matchAll({ type: 'window' }).then(list => {
      for (const client of list) {
        if ('focus' in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow('/');
    })
  );
});

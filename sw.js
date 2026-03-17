// Rada Service Worker - handles background reminder notifications
const CACHE_NAME = 'rada-v1';

// Store reminders received from the app
let reminders = [];
let lastFired = {}; // track which reminders fired today: "id_HH:MM" -> date

self.addEventListener('install', e => {
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(clients.claim());
  // Start the reminder check loop
  startReminderLoop();
});

// Receive reminders from the main app
self.addEventListener('message', e => {
  if (e.data?.type === 'UPDATE_REMINDERS') {
    reminders = e.data.reminders || [];
  }
});

function startReminderLoop() {
  // Check every 30 seconds
  setInterval(checkReminders, 30000);
}

function checkReminders() {
  if (!reminders.length) return;

  const now = new Date();
  const dow = now.getDay(); // 0=Sun
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  const currentTime = hh + ':' + mm;
  const today = now.toISOString().slice(0, 10);

  reminders.forEach(r => {
    if (!r.enabled) return;

    // Check repeat rule
    const shouldFire = (
      r.repeat === 'daily' ||
      (r.repeat === 'weekdays' && dow >= 1 && dow <= 5) ||
      (r.repeat === 'weekends' && (dow === 0 || dow === 6)) ||
      (r.repeat === 'once')
    );
    if (!shouldFire) return;

    // Check each time
    const times = r.times || (r.time ? [r.time] : []);
    times.forEach(t => {
      const key = r.id + '_' + t;
      // Fire if time matches and hasn't fired today yet
      if (t === currentTime && lastFired[key] !== today) {
        lastFired[key] = today;
        fireNotification(r);
      }
    });
  });
}

function fireNotification(reminder) {
  const options = {
    body: 'Time for: ' + reminder.name,
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: 'rada-reminder-' + reminder.id,
    renotify: true,
    vibrate: [200, 100, 200],
    data: { reminderId: reminder.id }
  };

  self.registration.showNotification(reminder.icon + ' ' + reminder.name, options);
}

self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(
    clients.matchAll({ type: 'window' }).then(clientList => {
      // Focus existing window if open
      for (const client of clientList) {
        if ('focus' in client) return client.focus();
      }
      // Otherwise open app
      if (clients.openWindow) return clients.openWindow('/');
    })
  );
});

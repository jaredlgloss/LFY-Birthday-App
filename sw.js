// Little Farmyard Birthday Reminder - Service Worker
// This file enables background push notifications on Android

const CACHE_NAME = 'lfy-birthday-v1';
const ICON_URL = 'https://littlefarmyard.co.za/wp-content/uploads/2022/07/Logo.png';

self.addEventListener('install', (event) => {
  console.log('[SW] Installing...');
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  console.log('[SW] Activated');
  event.waitUntil(clients.claim());
});

// Handle push notifications from server (optional — for future use)
self.addEventListener('push', (event) => {
  const data = event.data ? event.data.json() : {};
  const title = data.title || '🎂 Birthday Reminder – Little Farmyard';
  const options = {
    body: data.body || "Someone has a birthday today! Don't forget to send a message. 🎉",
    icon: ICON_URL,
    badge: ICON_URL,
    vibrate: [200, 100, 200],
    tag: data.tag || 'birthday-reminder',
    renotify: true,
    actions: [
      { action: 'open', title: '📱 Open App' },
      { action: 'dismiss', title: 'Dismiss' }
    ]
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

// Handle notification click
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  if (event.action === 'dismiss') return;
  event.waitUntil(
    clients.matchAll({ type: 'window' }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow('/');
    })
  );
});

// Periodic background sync (fires ~once per day when registered)
self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'birthday-daily-check') {
    event.waitUntil(performBirthdayCheck());
  }
});

async function performBirthdayCheck() {
  // Read saved data from IndexedDB/cache and fire notifications
  // This runs in the background even when the app is closed
  try {
    const cache = await caches.open(CACHE_NAME);
    const response = await cache.match('app-data');
    if (!response) return;
    const data = await response.json();
    if (!data || !data.people) return;

    const today = new Date();
    const todayBirthdays = data.people.filter(p => {
      if (!p.bdate) return false;
      return p.bdate.month === today.getMonth() + 1 && p.bdate.day === today.getDate();
    });

    for (const person of todayBirthdays) {
      await self.registration.showNotification(`🎂 ${person.name} ${person.surname}'s Birthday!`, {
        body: `Today is ${person.name}'s birthday! Don't forget to send them a message. 📱 ${person.phone || ''}`,
        icon: ICON_URL,
        badge: ICON_URL,
        vibrate: [200, 100, 200, 100, 200],
        tag: `bday-${person.name}-${today.toDateString()}`,
        renotify: false
      });
    }
  } catch (err) {
    console.error('[SW] Birthday check failed:', err);
  }
}

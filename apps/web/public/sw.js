const CACHE = 'taskflow-v4';
const ASSETS = ['/', '/login', '/register', '/app'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  // Никогда не кэшируем API: на проде web и api — разные origins
  // (3 отдельных Vercel-проекта), и старый cache-first для API отдает
  // stale-список без только что созданной задачи.
  try {
    const url = new URL(request.url);
    if (url.origin !== self.location.origin) return;
    if (
      url.pathname.startsWith('/tasks') ||
      url.pathname.startsWith('/projects') ||
      url.pathname.startsWith('/habits') ||
      url.pathname.startsWith('/goals') ||
      url.pathname.startsWith('/birthdays') ||
      url.pathname.startsWith('/focus') ||
      url.pathname.startsWith('/tags') ||
      url.pathname.startsWith('/graph') ||
      url.pathname.startsWith('/auth') ||
      url.pathname.startsWith('/export') ||
      url.pathname.startsWith('/smart-lists') ||
      url.pathname.startsWith('/ai')
    ) {
      return;
    }
  } catch {
    return;
  }

  // Network-first for API
  if (request.url.includes(':3001') || request.url.includes('/api/')) {
    event.respondWith(
      fetch(request).catch(() => caches.match(request))
    );
    return;
  }

  // HTML/navigation requests must be network-first so a deployment never
  // gets stuck on a stale /login or /app page.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  // Cache-first for static assets.
  event.respondWith(
    caches.match(request).then((cached) => {
      const fetched = fetch(request).then((response) => {
        if (response && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, clone));
        }
        return response;
      }).catch(() => cached);
      return cached || fetched;
    })
  );
});

// Web Push (works with the tab closed, on desktop and mobile).
// Payload from the server: { title, body, tag, url, type }.
self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = {};
  }
  const title = data.title || 'TaskFlow';
  const options = {
    body: data.body || '',
    icon: '/logo-tf.png',
    badge: '/favicon.png',
    tag: data.tag || 'taskflow-push',
    renotify: true,
    requireInteraction: data.type === 'reminder',
    data: { url: data.url || '/app' },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/app';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ('focus' in client) {
          try {
            client.navigate(url);
          } catch {}
          return client.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
      return undefined;
    })
  );
});

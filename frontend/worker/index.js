/* Custom service worker (bundled into sw.js by next-pwa) */

/** Drop stale navigations after a new SW activates (post-deploy WebView recovery). */
self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => key === 'document-cache')
          .map((key) => caches.delete(key)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('push', (event) => {
  let payload = { title: 'Locum Link', body: 'You have a new update', url: '/' };
  try {
    if (event.data) {
      const parsed = event.data.json();
      payload = { ...payload, ...parsed };
    }
  } catch {
    /* ignore malformed payload */
  }

  event.waitUntil(
    (async () => {
      await self.registration.showNotification(payload.title, {
        body: payload.body,
        icon: '/logo.png',
        badge: '/logo.png',
        tag: 'locumlink-notification',
        data: { url: payload.url || '/' },
      });
      const clients = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      });
      for (const client of clients) {
        client.postMessage({ type: 'LL_PWA_REFRESH' });
      }
    })(),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || '/';

  event.waitUntil(
    (async () => {
      const clients = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      });
      if (clients.length > 0) {
        let client = clients[0];
        for (const c of clients) {
          if (c.focused) {
            client = c;
            break;
          }
        }
        await client.focus();
        if ('navigate' in client && typeof client.navigate === 'function') {
          return client.navigate(targetUrl);
        }
        client.postMessage({ type: 'LL_NAVIGATE', url: targetUrl });
        return;
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })(),
  );
});

const NOTIFICATION_ICON = new URL("./assets/icon-192.png?v=20260710-1", self.registration.scope).href;

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch (error) {
    payload = {};
  }

  const isIOS = /iPad|iPhone|iPod/.test(self.navigator?.userAgent || "")
    || (/Macintosh/.test(self.navigator?.userAgent || "") && "standalone" in self.navigator);
  const title = isIOS ? payload.iosTitle || payload.title || "SAD" : payload.title || "SAD";
  const options = {
    body: isIOS ? payload.iosBody || payload.body || "Tienes una nueva notificacion." : payload.body || "Tienes una nueva notificacion.",
    icon: payload.icon || NOTIFICATION_ICON,
    badge: payload.badge || NOTIFICATION_ICON,
    tag: payload.notificationId ? `sad-${payload.notificationId}` : "sad-notification",
    renotify: Boolean(payload.notificationId),
    data: {
      url: payload.url || "./",
      notificationId: payload.notificationId || "",
      requestId: payload.requestId || ""
    }
  };

  event.waitUntil((async () => {
    const windows = await clients.matchAll({ type: "window", includeUncontrolled: true });
    const focusedWindow = windows.find((client) => client.visibilityState === "visible" && client.focused);
    if (focusedWindow) return;
    await self.registration.showNotification(title, options);
  })());
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = new URL(event.notification.data?.url || "./", self.registration.scope).href;

  event.waitUntil((async () => {
    const windows = await clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const client of windows) {
      if ("navigate" in client && "focus" in client) {
        await client.navigate(targetUrl);
        return client.focus();
      }
    }
    return clients.openWindow(targetUrl);
  })());
});

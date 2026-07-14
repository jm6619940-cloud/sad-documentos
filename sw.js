const CACHE_NAME = "sad-static-v20260714-5";
const NOTIFICATION_ICON = new URL("./assets/icon-192.png?v=20260710-1", self.registration.scope).href;
const STATIC_ASSETS = [
  "./",
  "./index.html",
  "./manifest.webmanifest?v=20260710-2",
  "./css/styles.css?v=20260714-5",
  "./js/app.js?v=20260714-5",
  "./js/components/layout.js?v=20260708-14",
  "./js/components/modal.js?v=20260708-12",
  "./js/components/toast.js?v=20260708-12",
  "./js/components/icons.js",
  "./js/services/dataService.js?v=20260713-5",
  "./js/services/supabaseClient.js",
  "./js/services/browserNotifications.js?v=20260714-5",
  "./js/pages/dashboard.js?v=20260710-1",
  "./js/pages/newRequest.js?v=20260713-1",
  "./js/pages/requestsTable.js?v=20260710-9",
  "./js/pages/requestDetail.js?v=20260713-7",
  "./js/pages/users.js?v=20260713-1",
  "./js/pages/catalogs.js?v=20260713-1",
  "./js/pages/profile.js?v=20260714-5",
  "./js/pages/notifications.js?v=20260710-1",
  "./js/utils/constants.js",
  "./js/utils/format.js",
  "./js/utils/purchases.js",
  "./js/utils/security.js",
  "./js/utils/validators.js",
  "./assets/icon-192.png?v=20260710-2",
  "./assets/icon-512.png",
  "./assets/apple-touch-icon.png?v=20260710-2",
  "./assets/sad-app-icon.svg",
  "./assets/sad-workspace.svg"
];
const CDN_ASSETS = [
  "https://cdn.jsdelivr.net/npm/bootstrap@5.3.8/dist/css/bootstrap.min.css",
  "https://cdn.jsdelivr.net/npm/bootstrap@5.3.8/dist/js/bootstrap.bundle.min.js",
  "https://cdn.jsdelivr.net/npm/sweetalert2@11.26.25/dist/sweetalert2.min.css",
  "https://cdn.jsdelivr.net/npm/sweetalert2@11.26.25/dist/sweetalert2.all.min.js",
  "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm",
  "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.mjs",
  "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.worker.mjs",
  "https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/+esm",
  "https://cdn.jsdelivr.net/npm/@techstark/opencv-js@4.10.0-release.1/dist/opencv.js"
];

async function cacheAppShell() {
  const cache = await caches.open(CACHE_NAME);
  await Promise.allSettled([...STATIC_ASSETS, ...CDN_ASSETS].map(async (url) => {
    const request = new Request(url, { cache: "reload" });
    const response = await fetch(request);
    if (response && (response.ok || response.type === "opaque" || response.type === "cors")) {
      await cache.put(request, response);
    }
  }));
}

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    await cacheAppShell();
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter((name) => name.startsWith("sad-static-") && name !== CACHE_NAME).map((name) => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener("message", (event) => {
  if (event.data?.type !== "SAD_PRECACHE") return;
  event.waitUntil(cacheAppShell());
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  const isStatic = url.origin === self.location.origin
    || url.hostname === "cdn.jsdelivr.net";
  if (!isStatic) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(request, { ignoreSearch: false });
    if (cached) return cached;
    try {
      const response = await fetch(request);
      if (response && (response.ok || response.type === "opaque" || response.type === "cors")) {
        await cache.put(request, response.clone());
      }
      return response;
    } catch (error) {
      if (request.mode === "navigate") {
        const fallback = await cache.match("./index.html");
        if (fallback) return fallback;
      }
      throw error;
    }
  })());
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

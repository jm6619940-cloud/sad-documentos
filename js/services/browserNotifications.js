import { APP_CONFIG } from "../config.js";
import { dataService } from "./dataService.js?v=20260708-6";
import { getSupabase } from "./supabaseClient.js";

const POLL_INTERVAL_MS = 30000;
const ICON_URL = "./assets/sad-workspace.svg";
const SERVICE_WORKER_URL = "./sw.js";

let channel = null;
let pollTimer = null;
let activeUserId = "";
let knownNotificationIds = new Set();
let latestDataLoader = null;
let clickHandler = null;
let dataHandler = null;

export function browserNotificationState() {
  if (!("Notification" in window)) return "unsupported";
  if (!isNotificationSecureContext()) return "insecure";
  return Notification.permission;
}

export function pushNotificationState() {
  const notificationState = browserNotificationState();
  if (notificationState === "unsupported" || notificationState === "insecure") return notificationState;
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return "push-unsupported";
  if (!APP_CONFIG.vapidPublicKey) return "missing-vapid-key";
  return notificationState;
}

export async function requestBrowserNotificationPermission(user) {
  const state = browserNotificationState();
  if (state === "unsupported") throw new Error("Este navegador no soporta notificaciones.");
  if (state === "insecure") throw new Error("Las notificaciones requieren HTTPS.");

  const permission = state === "granted" ? "granted" : await Notification.requestPermission();
  if (permission !== "granted") return permission;

  await ensurePushSubscription(user, { required: true });
  return permission;
}

export async function ensurePushSubscription(user, options = {}) {
  if (!user?.id || browserNotificationState() !== "granted") return null;
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
    if (options.required) throw new Error("Este navegador no soporta push en segundo plano.");
    return null;
  }
  if (!APP_CONFIG.vapidPublicKey) {
    if (options.required) throw new Error("Falta configurar APP_CONFIG.vapidPublicKey en js/config.js.");
    return null;
  }

  const registration = await navigator.serviceWorker.register(SERVICE_WORKER_URL);
  const existing = await registration.pushManager.getSubscription();
  const subscription = existing || await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(APP_CONFIG.vapidPublicKey)
  });

  await dataService.savePushSubscription(user.id, subscription);
  return subscription;
}

export function showBrowserNotification(notification, options = {}) {
  if (browserNotificationState() !== "granted") return null;
  const title = notification?.titulo || options.title || "SAD";
  const body = notificationBody(notification) || options.body || "Tienes una nueva notificacion.";
  const browserNotification = new Notification(title, {
    body,
    icon: ICON_URL,
    badge: ICON_URL,
    tag: notification?.id ? `sad-${notification.id}` : `sad-${Date.now()}`,
    renotify: true,
    data: { notificationId: notification?.id || "" }
  });

  browserNotification.onclick = () => {
    window.focus();
    browserNotification.close();
    if (notification && clickHandler) clickHandler(notification);
  };

  return browserNotification;
}

export async function showServiceWorkerNotification(notification, options = {}) {
  const state = browserNotificationState();
  if (state !== "granted") {
    throw new Error("Las notificaciones no estan permitidas en este navegador.");
  }

  const title = notification?.titulo || options.title || "SAD";
  const body = notificationBody(notification) || options.body || "Tienes una nueva notificacion.";

  if (!("serviceWorker" in navigator)) {
    const fallback = showBrowserNotification(notification, options);
    if (!fallback) throw new Error("Este navegador no pudo mostrar la notificacion.");
    return fallback;
  }

  await navigator.serviceWorker.register(SERVICE_WORKER_URL);
  const registration = await navigator.serviceWorker.ready;
  await registration.showNotification(title, {
    body,
    icon: ICON_URL,
    badge: ICON_URL,
    tag: notification?.id ? `sad-${notification.id}` : `sad-test-${Date.now()}`,
    renotify: Boolean(notification?.id),
    data: {
      notificationId: notification?.id || "",
      url: options.url || "./"
    }
  });
  return true;
}

export function seedBrowserNotifications(data, user) {
  knownNotificationIds = new Set(userNotifications(data, user).map((item) => item.id));
}

export async function startBrowserNotificationStream({ user, data, loadData, onData, onClick }) {
  if (!user?.id) return;
  latestDataLoader = loadData;
  dataHandler = onData;
  clickHandler = onClick;

  if (activeUserId !== user.id) {
    await stopBrowserNotificationStream();
    activeUserId = user.id;
    seedBrowserNotifications(data, user);
  } else {
    for (const notification of userNotifications(data, user)) {
      await handleIncomingNotification(notification);
    }
  }

  ensurePushSubscription(user).catch((error) => {
    console.warn("No se pudo sincronizar la suscripcion push.", error);
  });
  await subscribeRealtime(user.id);
  startPolling(user);
}

export async function stopBrowserNotificationStream() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
  if (channel) {
    const supabase = await getSupabase();
    await supabase.removeChannel(channel);
    channel = null;
  }
  activeUserId = "";
  knownNotificationIds = new Set();
  latestDataLoader = null;
  dataHandler = null;
  clickHandler = null;
}

async function subscribeRealtime(userId) {
  if (channel) return;
  const supabase = await getSupabase();
  channel = supabase
    .channel(`sad-notificaciones-${userId}`)
    .on("postgres_changes", {
      event: "INSERT",
      schema: "public",
      table: "notificaciones",
      filter: `usuario_id=eq.${userId}`
    }, async (payload) => {
      await handleIncomingNotification(payload.new);
    })
    .subscribe();
}

function startPolling(user) {
  if (pollTimer || !latestDataLoader) return;
  pollTimer = setInterval(async () => {
    try {
      const data = await latestDataLoader();
      if (dataHandler) dataHandler(data);
      userNotifications(data, user).forEach((notification) => {
        if (!knownNotificationIds.has(notification.id)) {
          handleIncomingNotification(notification);
        }
      });
    } catch (error) {
      console.warn("No se pudieron consultar notificaciones.", error);
    }
  }, POLL_INTERVAL_MS);
}

async function handleIncomingNotification(notification) {
  if (!notification?.id || knownNotificationIds.has(notification.id)) return;
  knownNotificationIds.add(notification.id);
  if (APP_CONFIG.vapidPublicKey && browserNotificationState() === "granted") return;
  showBrowserNotification(notification);
}

function userNotifications(data, user) {
  return (data?.notificaciones || []).filter((item) => item.usuario_id === user.id);
}

function notificationBody(notification) {
  if (!notification) return "";
  return notification.mensaje || "Tienes una nueva notificacion.";
}

function isNotificationSecureContext() {
  return window.isSecureContext || location.hostname === "localhost" || location.hostname === "127.0.0.1";
}

function urlBase64ToUint8Array(value) {
  const padding = "=".repeat((4 - value.length % 4) % 4);
  const base64 = `${value}${padding}`.replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)));
}

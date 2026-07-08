import { APP_CONFIG } from "../config.js";
import { dataService } from "./dataService.js?v=20260708-11";
import { getSupabase } from "./supabaseClient.js";

const POLL_INTERVAL_MS = 30000;
const ICON_URL = "./assets/icon-192.png";
const SERVICE_WORKER_URL = "./sw.js";
const REALTIME_REFRESH_DELAY_MS = 500;

let channel = null;
let pollTimer = null;
let refreshTimer = null;
let activeUserId = "";
let knownNotificationIds = new Set();
let latestDataLoader = null;
let latestData = null;
let clickHandler = null;
let dataHandler = null;

export function browserNotificationState() {
  if (!("Notification" in window)) return "unsupported";
  if (!isNotificationSecureContext()) return "insecure";
  return Notification.permission;
}

export function pushNotificationState() {
  if (isIOSDevice() && !isStandaloneApp()) return "ios-not-installed";
  const notificationState = browserNotificationState();
  if (notificationState === "unsupported" || notificationState === "insecure") return notificationState;
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return "push-unsupported";
  if (!APP_CONFIG.vapidPublicKey) return "missing-vapid-key";
  return notificationState;
}

export async function requestBrowserNotificationPermission(user) {
  if (isIOSDevice() && !isStandaloneApp()) {
    throw new Error("En iPhone debes agregar SAD a la pantalla de inicio y abrirla desde ese icono para recibir notificaciones con el celular bloqueado.");
  }
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

  const registration = await navigator.serviceWorker.register(SERVICE_WORKER_URL, { scope: "./" });
  registration.update().catch(() => {});
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
  const title = notificationTitle(notification) || options.title || "SAD";
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

  const title = notificationTitle(notification) || options.title || "SAD";
  const body = notificationBody(notification) || options.body || "Tienes una nueva notificacion.";

  if (!("serviceWorker" in navigator)) {
    const fallback = showBrowserNotification(notification, options);
    if (!fallback) throw new Error("Este navegador no pudo mostrar la notificacion.");
    return fallback;
  }

  const registrationInstall = await navigator.serviceWorker.register(SERVICE_WORKER_URL, { scope: "./" });
  registrationInstall.update().catch(() => {});
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
  latestData = data;
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
  if (refreshTimer) {
    clearTimeout(refreshTimer);
    refreshTimer = null;
  }
  if (channel) {
    const supabase = await getSupabase();
    await supabase.removeChannel(channel);
    channel = null;
  }
  activeUserId = "";
  knownNotificationIds = new Set();
  latestDataLoader = null;
  latestData = null;
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
      await refreshDataSoon();
      await handleIncomingNotification(payload.new);
    })
    .on("postgres_changes", {
      event: "*",
      schema: "public",
      table: "solicitudes"
    }, refreshDataSoon)
    .on("postgres_changes", {
      event: "*",
      schema: "public",
      table: "solicitud_aprobadores"
    }, refreshDataSoon)
    .on("postgres_changes", {
      event: "*",
      schema: "public",
      table: "comentarios"
    }, refreshDataSoon)
    .subscribe();
}

function startPolling(user) {
  if (pollTimer || !latestDataLoader) return;
  pollTimer = setInterval(async () => {
    try {
      const data = await latestDataLoader();
      latestData = data;
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
  if (APP_CONFIG.vapidPublicKey && browserNotificationState() === "granted" && document.visibilityState !== "visible") return;
  showBrowserNotification(notification);
}

async function refreshDataSoon() {
  if (!latestDataLoader) return;
  if (refreshTimer) clearTimeout(refreshTimer);
  refreshTimer = setTimeout(async () => {
    refreshTimer = null;
    try {
      const data = await latestDataLoader();
      latestData = data;
      if (dataHandler) dataHandler(data);
    } catch (error) {
      console.warn("No se pudieron refrescar los datos en tiempo real.", error);
    }
  }, REALTIME_REFRESH_DELAY_MS);
}

function userNotifications(data, user) {
  return (data?.notificaciones || []).filter((item) => item.usuario_id === user.id);
}

function notificationBody(notification) {
  if (!notification) return "";
  const request = requestFromNotification(notification);
  if (request?.titulo) return notificationActionText(notification, request);
  const message = stripRequestCode(notification.mensaje);
  if (message) return message;
  return notification.mensaje || "Tienes una nueva notificacion.";
}

function notificationTitle(notification) {
  const title = `${notification?.titulo || ""}`.toLowerCase();
  if (title.includes("asignada")) return "Nueva solicitud asignada";
  if (title.includes("corregida")) return "Solicitud corregida";
  if (title.includes("correccion")) return "Correccion solicitada";
  if (title.includes("aprobado") || title.includes("aprobada")) return "Solicitud aprobada";
  if (title.includes("rechazado") || title.includes("rechazada")) return "Solicitud rechazada";
  if (title.includes("cancelado") || title.includes("cancelada")) return "Solicitud cancelada";
  return notification?.titulo || "";
}

function notificationActionText(notification, request) {
  const actor = actorName(notification, request);
  const summary = `${request.titulo} - ${friendlyStatus(request.estado || notificationTitle(notification))}`;
  return actor ? `${actor}: ${summary}` : summary;
}

function requestFromNotification(notification) {
  const code = extractRequestCode(`${notification?.titulo || ""} ${notification?.mensaje || ""}`);
  if (!code) return null;
  return (latestData?.solicitudes || []).find((item) => item.codigo?.toLowerCase() === code.toLowerCase()) || null;
}

function actorName(notification, request) {
  const title = `${notification?.titulo || ""}`.toLowerCase();
  const profile = title.includes("asignada")
    ? request.creador
    : request.aprobador || request.creador;
  const fullName = `${profile?.nombre || ""} ${profile?.apellido || ""}`.trim();
  return fullName || profile?.correo || "";
}

function friendlyStatus(status = "") {
  const normalized = status.replace(/^Solicitud\s+/i, "").trim();
  if (!normalized) return "Actualizada";
  if (normalized.toLowerCase() === "aprobado") return "Aprobada";
  if (normalized.toLowerCase() === "rechazado") return "Rechazada";
  if (normalized.toLowerCase() === "cancelado") return "Cancelada";
  return normalized;
}

function stripRequestCode(text = "") {
  return text.replace(/AUT-\d{4}-\d{6}:?\s*/i, "").trim();
}

function extractRequestCode(text) {
  return text.match(/AUT-\d{4}-\d{6}/i)?.[0] || "";
}

function isNotificationSecureContext() {
  return window.isSecureContext || location.hostname === "localhost" || location.hostname === "127.0.0.1";
}

function isIOSDevice() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent)
    || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

function isStandaloneApp() {
  return window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
}

function urlBase64ToUint8Array(value) {
  const padding = "=".repeat((4 - value.length % 4) % 4);
  const base64 = `${value}${padding}`.replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)));
}

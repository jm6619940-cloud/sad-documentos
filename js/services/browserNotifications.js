import { APP_CONFIG } from "../config.js";
import { dataService } from "./dataService.js";
import { getSupabase } from "./supabaseClient.js";
import { versioned } from "../utils/appVersion.js";

const POLL_INTERVAL_MS = 30000;
const ICON_URL = "./assets/icon-192.png?v=20260715-1";
const SERVICE_WORKER_URL = versioned("./sw.js");
const REALTIME_REFRESH_DELAY_MS = 500;
const PUSH_REPAIR_KEY = "sad-push-needs-repair";

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
  if (notificationState === "granted" && localStorage.getItem(PUSH_REPAIR_KEY) === "1") return "push-needs-repair";
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

  try {
    await ensurePushSubscription(user, { required: true });
  } catch (error) {
    markPushNeedsRepair();
    throw error;
  }
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

  const applicationServerKey = urlBase64ToUint8Array(APP_CONFIG.vapidPublicKey);
  const registration = await readyServiceWorkerRegistration();
  let subscription = await registration.pushManager.getSubscription();

  if (subscription && !subscriptionUsesCurrentKey(subscription, applicationServerKey)) {
    await subscription.unsubscribe().catch(() => {});
    subscription = null;
  }

  if (!subscription) {
    subscription = await subscribePush(registration, applicationServerKey);
  }

  try {
    await dataService.savePushSubscription(user.id, subscription);
  } catch (error) {
    if (isRecoverablePushError(error)) {
      await subscription.unsubscribe().catch(() => {});
      subscription = await subscribePush(registration, applicationServerKey);
      await dataService.savePushSubscription(user.id, subscription);
    } else {
      throw error;
    }
  }

  localStorage.removeItem(PUSH_REPAIR_KEY);
  return subscription;
}

export function showBrowserNotification(notification, options = {}) {
  if (browserNotificationState() !== "granted") return null;
  const title = notificationDisplayTitle(notification);
  const body = notificationDisplayBody(notification, options);
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

  const title = notificationDisplayTitle(notification);
  const body = notificationDisplayBody(notification, options);

  if (!("serviceWorker" in navigator)) {
    const fallback = showBrowserNotification(notification, options);
    if (!fallback) throw new Error("Este navegador no pudo mostrar la notificacion.");
    return fallback;
  }

  const registration = await readyServiceWorkerRegistration();
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

function notificationDisplayTitle(notification) {
  return isIOSDevice() ? notificationTitle(notification) || "SAD" : "SAD";
}

function notificationDisplayBody(notification, options = {}) {
  if (isIOSDevice()) return notificationBody(notification) || options.body || "Tienes una nueva notificacion.";
  return notificationText(notification) || options.body || "Tienes una nueva notificacion.";
}

async function readyServiceWorkerRegistration() {
  const registration = await navigator.serviceWorker.register(SERVICE_WORKER_URL, { scope: "./" });
  registration.update().catch(() => {});

  if (registration.installing && !registration.active) {
    await waitForServiceWorkerActivation(registration.installing);
  }

  return navigator.serviceWorker.ready;
}

function waitForServiceWorkerActivation(worker) {
  if (!worker || worker.state === "activated") return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("El servicio de notificaciones tardo demasiado en activarse. Cierra y abre SAD e intenta de nuevo.")), 8000);
    worker.addEventListener("statechange", () => {
      if (worker.state !== "activated") return;
      clearTimeout(timeout);
      resolve();
    });
  });
}

async function subscribePush(registration, applicationServerKey) {
  try {
    return await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey
    });
  } catch (error) {
    const existing = await registration.pushManager.getSubscription().catch(() => null);
    if (existing) await existing.unsubscribe().catch(() => {});
    try {
      return await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey
      });
    } catch (retryError) {
      throw new Error(pushSubscribeErrorMessage(retryError));
    }
  }
}

function subscriptionUsesCurrentKey(subscription, applicationServerKey) {
  const currentKey = subscription?.options?.applicationServerKey;
  if (!currentKey) return true;
  const existing = currentKey instanceof ArrayBuffer ? new Uint8Array(currentKey) : new Uint8Array(currentKey.buffer || currentKey);
  if (existing.length !== applicationServerKey.length) return false;
  return existing.every((value, index) => value === applicationServerKey[index]);
}

function isRecoverablePushError(error) {
  const message = `${error?.message || ""}`.toLowerCase();
  return message.includes("row-level security")
    || message.includes("subscription")
    || message.includes("endpoint")
    || message.includes("push");
}

function pushSubscribeErrorMessage(error) {
  const message = `${error?.message || error || ""}`.trim();
  if (/permission|denied/i.test(message)) {
    return "Android bloqueo las notificaciones para SAD. Activalas en Configuracion del sitio y vuelve a intentarlo.";
  }
  if (/registration|active service worker|service worker/i.test(message)) {
    return "Android aun no tenia listo el servicio de notificaciones. Cierra y abre SAD e intenta activar de nuevo.";
  }
  if (/subscribe|push service|subscription/i.test(message)) {
    return "No se pudo crear la suscripcion push en Android. Borra el permiso de notificaciones del sitio, vuelve a permitirlo e intenta de nuevo.";
  }
  return message || "No se pudo activar la suscripcion push del navegador.";
}

function markPushNeedsRepair() {
  try {
    localStorage.setItem(PUSH_REPAIR_KEY, "1");
  } catch (error) {
    // No bloquea el flujo si el navegador restringe almacenamiento local.
  }
}

export function seedBrowserNotifications(data, user) {
  knownNotificationIds = new Set(userNotifications(data, user).map((item) => item.id));
}

export async function syncAppBadge(data, user) {
  if (!("setAppBadge" in navigator || "clearAppBadge" in navigator)) return false;
  if (!user?.id) {
    try {
      if ("clearAppBadge" in navigator) await navigator.clearAppBadge();
      return true;
    } catch (error) {
      return false;
    }
  }
  const unread = userNotifications(data, user).filter((item) => !item.leida).length;
  try {
    if (unread > 0 && "setAppBadge" in navigator) {
      await navigator.setAppBadge(unread);
    } else if ("clearAppBadge" in navigator) {
      await navigator.clearAppBadge();
    }
    return true;
  } catch (error) {
    return false;
  }
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
  await syncAppBadge(data, user);

  ensurePushSubscription(user).catch((error) => {
    markPushNeedsRepair();
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
      await syncAppBadge(data, user);
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
      await syncAppBadge(data, { id: activeUserId });
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
  if (`${notification.titulo || ""}`.toLowerCase().includes("mensaje")) {
    const chat = parseChatNotification(notification.mensaje);
    const request = requestFromNotification(notification);
    const requestTitle = request?.titulo || chat.requestTitle || "Solicitud";
    const preview = chat.message ? `\n${chat.message}` : "";
    return chat.actor ? `${chat.actor}: ${requestTitle}${preview}` : `${requestTitle}${preview}`;
  }
  const request = requestFromNotification(notification);
  if (request?.titulo) return notificationActionText(notification, request);
  const message = stripRequestCode(notification.mensaje);
  if (message) return message;
  return notification.mensaje || "Actualizacion disponible.";
}

function notificationText(notification) {
  const title = notificationTitle(notification);
  const body = notificationBody(notification);
  return body ? `${title}\n${body}` : title;
}

function notificationTitle(notification) {
  const title = `${notification?.titulo || ""}`.toLowerCase();
  if (title.includes("mensaje")) return "Nuevo mensaje en solicitud";
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
  const summary = `${request.titulo} - ${notificationStatus(notification, request)}`;
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

function notificationStatus(notification, request) {
  const title = `${notification?.titulo || ""}`.toLowerCase();
  if (title.includes("asignada")) return "Pendiente";
  if (title.includes("corregida")) return "Pendiente";
  if (title.includes("correccion")) return "Correccion solicitada";
  if (title.includes("aprobado") || title.includes("aprobada")) return "Aprobada";
  if (title.includes("rechazado") || title.includes("rechazada")) return "Rechazada";
  if (title.includes("cancelado") || title.includes("cancelada")) return "Cancelada";
  return friendlyStatus(request.estado || notificationTitle(notification));
}

function stripRequestCode(text = "") {
  return text.replace(/AUT-\d{4}-\d{6}:?\s*/i, "").trim();
}

function parseChatNotification(message = "") {
  const [summary = "", ...rest] = String(message).split(/\n+/);
  const requestTitle = stripRequestCode(summary).replace(/\s+requiere tu revision\.?$/i, "").trim();
  const body = rest.join(" ").trim();
  const match = body.match(/^([^:]{1,90}):\s*(.+)$/);
  return {
    requestTitle,
    actor: match?.[1]?.trim() || "",
    message: match?.[2]?.trim() || body
  };
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

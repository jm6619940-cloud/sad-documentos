import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

type NotificationRecord = {
  id: string;
  usuario_id: string;
  titulo: string;
  mensaje: string;
};

type PushSubscriptionRow = {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-sad-webhook-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const vapidSubject = Deno.env.get("VAPID_SUBJECT") || "mailto:admin@example.com";
const vapidPublicKey = Deno.env.get("VAPID_PUBLIC_KEY") || "";
const vapidPrivateKey = Deno.env.get("VAPID_PRIVATE_KEY") || "";
const webhookSecret = Deno.env.get("WEBHOOK_SECRET") || "";

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  if (!isConfigured()) {
    return json({ error: "Push function is not configured." }, 500);
  }

  webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);
  const supabase = createAdminClient();

  if (request.headers.get("x-sad-webhook-secret") !== webhookSecret) {
    return json({ error: "Unauthorized" }, 401);
  }

  const body = await request.json().catch(() => ({}));
  const notification = body.record || body.notification || body;

  if (!isNotificationRecord(notification)) {
    return json({ error: "Invalid notification payload." }, 400);
  }

  const { data: subscriptions, error } = await supabase
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("usuario_id", notification.usuario_id)
    .eq("activo", true);

  if (error) return json({ error: error.message }, 500);
  if (!subscriptions?.length) return json({ sent: 0, removed: 0 });

  const requestInfo = await findRequestInfo(supabase, notification);
  const payload = JSON.stringify({
    title: notification.titulo || "SAD",
    body: pushBody(notification, requestInfo),
    notificationId: notification.id,
    requestId: requestInfo?.id || "",
    url: requestInfo?.id ? `./?request=${requestInfo.id}&notification=${notification.id}` : "./"
  });

  let sent = 0;
  let removed = 0;

  await Promise.all(subscriptions.map(async (subscription: PushSubscriptionRow) => {
    try {
      await webpush.sendNotification({
        endpoint: subscription.endpoint,
        keys: {
          p256dh: subscription.p256dh,
          auth: subscription.auth
        }
      }, payload);
      sent += 1;
    } catch (error) {
      const pushError = error as { statusCode?: number; status?: number };
      const statusCode = Number(pushError.statusCode || pushError.status || 0);
      if (statusCode === 404 || statusCode === 410) {
        removed += 1;
        await supabase
          .from("push_subscriptions")
          .update({ activo: false, updated_at: new Date().toISOString() })
          .eq("id", subscription.id);
      } else {
        console.error("Push delivery failed", error);
      }
    }
  }));

  return json({ sent, removed });
});

function isConfigured() {
  return Boolean(supabaseUrl && serviceRoleKey && vapidPublicKey && vapidPrivateKey && webhookSecret);
}

function createAdminClient() {
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
}

function isNotificationRecord(value: unknown): value is NotificationRecord {
  const item = value as NotificationRecord;
  return Boolean(item?.id && item?.usuario_id && item?.titulo && item?.mensaje);
}

async function findRequestInfo(supabase: ReturnType<typeof createAdminClient>, notification: NotificationRecord) {
  const code = `${notification.titulo} ${notification.mensaje}`.match(/AUT-\d{4}-\d{6}/i)?.[0];
  if (!code) return null;

  const { data } = await supabase
    .from("solicitudes")
    .select("id, codigo, titulo")
    .eq("codigo", code)
    .maybeSingle();

  return data;
}

function pushBody(notification: NotificationRecord, requestInfo: { codigo?: string; titulo?: string } | null) {
  if (requestInfo?.codigo && requestInfo?.titulo) {
    return `${requestInfo.codigo} · ${requestInfo.titulo}`;
  }
  return notification.mensaje || "Tienes una nueva notificacion.";
}

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json"
    }
  });
}

import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import { getMessaging, getToken, onMessage, type Messaging } from "firebase/messaging";
import { supabase } from "@/integrations/supabase/client";

interface PushConfigResponse {
  configured: boolean;
  config: {
    apiKey: string;
    authDomain: string;
    projectId: string;
    messagingSenderId: string;
    appId: string;
  };
  vapidKey: string;
}

let cachedConfig: PushConfigResponse | null = null;
let app: FirebaseApp | null = null;
let messaging: Messaging | null = null;

export const pushSupported = () =>
  typeof window !== "undefined" &&
  "Notification" in window &&
  "serviceWorker" in navigator &&
  "PushManager" in window;

export async function fetchPushConfig(): Promise<PushConfigResponse | null> {
  if (cachedConfig) return cachedConfig;
  const { data, error } = await supabase.functions.invoke("push-config");
  if (error || !data) return null;
  cachedConfig = data as PushConfigResponse;
  return cachedConfig;
}

async function getMessagingInstance(cfg: PushConfigResponse): Promise<Messaging> {
  if (!app) app = getApps()[0] ?? initializeApp(cfg.config);
  if (!messaging) messaging = getMessaging(app);
  return messaging;
}

function swUrl(cfg: PushConfigResponse) {
  const params = new URLSearchParams(cfg.config as unknown as Record<string, string>);
  return `/firebase-messaging-sw.js?${params.toString()}`;
}

/** Requests permission, registers the messaging worker and stores the device token. */
export async function enablePushNotifications(): Promise<{ ok: boolean; message: string }> {
  if (!pushSupported()) {
    return { ok: false, message: "This browser does not support push notifications." };
  }
  const cfg = await fetchPushConfig();
  if (!cfg?.configured) {
    return { ok: false, message: "Push notifications are not configured yet (missing Firebase keys)." };
  }

  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    return { ok: false, message: "Notification permission was blocked in your browser." };
  }

  const registration = await navigator.serviceWorker.register(swUrl(cfg), { scope: "/" });
  await navigator.serviceWorker.ready;

  const messagingInstance = await getMessagingInstance(cfg);
  const token = await getToken(messagingInstance, {
    vapidKey: cfg.vapidKey,
    serviceWorkerRegistration: registration,
  });
  if (!token) return { ok: false, message: "Could not obtain a device token." };

  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) return { ok: false, message: "You need to be signed in." };

  const { error } = await supabase
    .from("push_tokens")
    .upsert(
      { user_id: userId, token, device_label: navigator.userAgent.slice(0, 120), enabled: true },
      { onConflict: "token" },
    );
  if (error) return { ok: false, message: error.message };

  return { ok: true, message: "Notifications enabled on this device." };
}

export async function disablePushNotifications(): Promise<void> {
  const cfg = await fetchPushConfig();
  if (!cfg?.configured) return;
  try {
    const messagingInstance = await getMessagingInstance(cfg);
    const token = await getToken(messagingInstance, { vapidKey: cfg.vapidKey }).catch(() => null);
    if (token) await supabase.from("push_tokens").delete().eq("token", token);
  } catch {
    // ignore
  }
  const regs = await navigator.serviceWorker.getRegistrations();
  await Promise.all(
    regs
      .filter((r) => r.active?.scriptURL.includes("firebase-messaging-sw.js"))
      .map((r) => r.unregister()),
  );
}

/** Whether this device already has a stored, enabled token. */
export async function isPushEnabledHere(): Promise<boolean> {
  if (!pushSupported() || Notification.permission !== "granted") return false;
  const cfg = await fetchPushConfig();
  if (!cfg?.configured) return false;
  try {
    const messagingInstance = await getMessagingInstance(cfg);
    const token = await getToken(messagingInstance, { vapidKey: cfg.vapidKey });
    if (!token) return false;
    const { data } = await supabase
      .from("push_tokens")
      .select("id")
      .eq("token", token)
      .eq("enabled", true)
      .maybeSingle();
    return Boolean(data);
  } catch {
    return false;
  }
}

/** Foreground messages (app open) — returns an unsubscribe function. */
export async function onForegroundPush(
  handler: (payload: { title?: string; body?: string; progress?: number; repos: string[] }) => void,
): Promise<() => void> {
  const cfg = await fetchPushConfig();
  if (!cfg?.configured || Notification.permission !== "granted") return () => {};
  const messagingInstance = await getMessagingInstance(cfg);
  return onMessage(messagingInstance, (payload) => {
    const data = (payload.data ?? {}) as Record<string, string>;
    handler({
      title: payload.notification?.title,
      body: payload.notification?.body,
      progress: data.progress !== undefined ? Number(data.progress) : undefined,
      repos: data.repos ? data.repos.split(",").filter(Boolean) : [],
    });
  });
}

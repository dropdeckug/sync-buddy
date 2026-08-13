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

const SW_URL = "/firebase-messaging-sw.js";

export const pushSupported = () =>
  typeof window !== "undefined" &&
  "Notification" in window &&
  "serviceWorker" in navigator &&
  "PushManager" in window;

/** Permission prompts are blocked inside cross-origin iframes (Lovable preview). */
export const inIframe = () => {
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
};

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

async function ensureRegistration(): Promise<ServiceWorkerRegistration> {
  const existing = await navigator.serviceWorker.getRegistrations();
  const found = existing.find((r) =>
    (r.active ?? r.installing ?? r.waiting)?.scriptURL.includes("firebase-messaging-sw.js"),
  );
  const reg = found ?? (await navigator.serviceWorker.register(SW_URL, { scope: "/" }));
  if (found) await found.update().catch(() => {});
  // On mobile the worker is often still "installing" when getToken() runs, which
  // makes the FCM subscribe call fail. Wait until it is actually active.
  await navigator.serviceWorker.ready;
  if (!reg.active) {
    await new Promise<void>((resolve) => {
      const t = setTimeout(resolve, 10000);
      const check = () => {
        if (reg.active) {
          clearTimeout(t);
          resolve();
        }
      };
      reg.addEventListener("updatefound", check);
      const iv = setInterval(() => {
        check();
        if (reg.active) clearInterval(iv);
      }, 250);
      setTimeout(() => clearInterval(iv), 10000);
    });
  }
  return reg;
}

/** iOS/iPadOS only allows web push from an installed (home-screen) PWA. */
const isIOS = () =>
  /iPad|iPhone|iPod/.test(navigator.userAgent) ||
  (navigator.platform === "MacIntel" && (navigator as any).maxTouchPoints > 1);

const isStandalone = () =>
  window.matchMedia?.("(display-mode: standalone)").matches ||
  (navigator as any).standalone === true;

async function requestToken(cfg: PushConfigResponse): Promise<{ token: string | null; error?: string }> {
  try {
    const registration = await ensureRegistration();
    const messagingInstance = await getMessagingInstance(cfg);
    const token = await getToken(messagingInstance, {
      vapidKey: cfg.vapidKey,
      serviceWorkerRegistration: registration,
    });
    return { token: token || null, error: token ? undefined : "FCM returned an empty token." };
  } catch (e: any) {
    const code = e?.code || "";
    let error = e?.message || String(e);
    if (code.includes("token-subscribe-failed") || code.includes("permission-blocked")) {
      error = `Push service rejected the subscription (${code}). ${error}`;
    }
    return { token: null, error };
  }
}

async function currentToken(cfg: PushConfigResponse): Promise<string | null> {
  return (await requestToken(cfg)).token;
}

/** Requests permission, registers the messaging worker and stores the device token. */
export async function enablePushNotifications(): Promise<{ ok: boolean; message: string }> {
  if (!pushSupported()) {
    if (isIOS() && !isStandalone()) {
      return {
        ok: false,
        message:
          "On iPhone/iPad you must first add this app to your Home Screen (Share → Add to Home Screen), then enable notifications from there.",
      };
    }
    return { ok: false, message: "This browser does not support push notifications." };
  }
  if (isIOS() && !isStandalone()) {
    return {
      ok: false,
      message:
        "On iPhone/iPad, add this app to your Home Screen (Share → Add to Home Screen) and enable notifications from the installed app.",
    };
  }
  if (!window.isSecureContext) {
    return { ok: false, message: "Notifications need a secure (https) connection." };
  }
  const cfg = await fetchPushConfig();
  if (!cfg?.configured) {
    return { ok: false, message: "Push notifications are not configured yet (missing Firebase keys)." };
  }

  const permission = await Notification.requestPermission().catch(() => "denied" as NotificationPermission);
  if (permission !== "granted") {
    return {
      ok: false,
      message: inIframe()
        ? "Open the app in its own browser tab to allow notifications (previews block the prompt)."
        : "Notification permission was blocked in your browser.",
    };
  }

  let { token, error: tokenError } = await requestToken(cfg);
  if (!token) {
    // Common on mobile: a stale service worker or an orphaned push
    // subscription. Clear both and try once more.
    try {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(
        regs
          .filter((r) =>
            (r.active ?? r.waiting ?? r.installing)?.scriptURL.includes("firebase-messaging-sw.js"),
          )
          .map(async (r) => {
            const sub = await r.pushManager.getSubscription();
            await sub?.unsubscribe().catch(() => {});
            await r.unregister();
          }),
      );
      messaging = null;
      const retry = await requestToken(cfg);
      token = retry.token;
      tokenError = retry.error ?? tokenError;
    } catch (e: any) {
      tokenError = tokenError ?? e?.message;
    }
  }
  if (!token) {
    return { ok: false, message: `Could not obtain a device token. ${tokenError ?? ""}`.trim() };
  }


  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) return { ok: false, message: "You need to be signed in." };

  const { error: upsertError } = await supabase
    .from("push_tokens")
    .upsert(
      { user_id: userId, token, device_label: navigator.userAgent.slice(0, 120), enabled: true },
      { onConflict: "token" },
    );
  if (upsertError) return { ok: false, message: upsertError.message };

  return { ok: true, message: "Notifications enabled on this device." };
}

export async function disablePushNotifications(): Promise<void> {
  const cfg = await fetchPushConfig();
  if (cfg?.configured) {
    try {
      const token = await currentToken(cfg);
      if (token) await supabase.from("push_tokens").delete().eq("token", token);
    } catch {
      // ignore
    }
  }
  const regs = await navigator.serviceWorker.getRegistrations();
  await Promise.all(
    regs
      .filter((r) => (r.active ?? r.waiting ?? r.installing)?.scriptURL.includes("firebase-messaging-sw.js"))
      .map((r) => r.unregister()),
  );
}

/** Whether this device already has a stored, enabled token. */
export async function isPushEnabledHere(): Promise<boolean> {
  if (!pushSupported() || Notification.permission !== "granted") return false;
  const cfg = await fetchPushConfig();
  if (!cfg?.configured) return false;
  try {
    const token = await currentToken(cfg);
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
      title: payload.notification?.title ?? data.title,
      body: payload.notification?.body ?? data.body,
      progress: data.progress !== undefined ? Number(data.progress) : undefined,
      repos: data.repos ? data.repos.split(",").filter(Boolean) : [],
    });
  });
}

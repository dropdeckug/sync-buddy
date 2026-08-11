/* Firebase Cloud Messaging service worker.
   Config comes from the push-config edge function (publishable client keys),
   with query params kept as a fallback for older registrations. */
importScripts("https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js");

const SUPABASE_URL = "https://fqfmcksbacfkwokmgqtd.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZxZm1ja3NiYWNma3dva21ncXRkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIwNTM5MDgsImV4cCI6MjA5NzYyOTkwOH0.lrmG0eHkBFjvskw19_h2TQND2K649lbCRICZcbOtWts";

const params = new URL(self.location).searchParams;

function showPayload(payload) {
  const data = payload.data || {};
  const notif = payload.notification || {};
  const progress = data.progress !== undefined ? Number(data.progress) : undefined;
  const repos = data.repos ? data.repos.split(",").filter(Boolean) : [];

  let body = notif.body || data.body || "";
  if (repos.length) {
    const shown = repos.slice(0, 5).map((r) => "• " + r).join("\n");
    body += "\n" + shown + (repos.length > 5 ? `\n• +${repos.length - 5} more` : "");
  }
  if (typeof progress === "number" && !Number.isNaN(progress)) {
    const filled = Math.max(0, Math.min(10, Math.round(progress / 10)));
    body += `\n[${"█".repeat(filled)}${"░".repeat(10 - filled)}] ${progress}%`;
  }

  return self.registration.showNotification(notif.title || data.title || "GitSync", {
    body,
    tag: data.tag || "gitsync",
    renotify: true,
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    data: { url: data.url || "/" },
  });
}

async function initFirebase() {
  let config = {
    apiKey: params.get("apiKey"),
    authDomain: params.get("authDomain"),
    projectId: params.get("projectId"),
    messagingSenderId: params.get("messagingSenderId"),
    appId: params.get("appId"),
  };

  if (!config.projectId) {
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/push-config`, {
        headers: { Authorization: `Bearer ${SUPABASE_ANON_KEY}`, apikey: SUPABASE_ANON_KEY },
      });
      const json = await res.json();
      if (json && json.config) config = json.config;
    } catch (e) {
      console.error("[fcm-sw] failed to load config", e);
    }
  }

  if (!config.projectId) return;
  firebase.initializeApp(config);
  firebase.messaging().onBackgroundMessage(showPayload);
}

const ready = initFirebase();

self.addEventListener("install", (event) => {
  event.waitUntil(ready.then(() => self.skipWaiting()));
});
self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

// Data-only messages (no `notification` block) still land here.
self.addEventListener("push", (event) => {
  if (!event.data) return;
  let payload;
  try {
    payload = event.data.json();
  } catch {
    return;
  }
  if (payload.notification) return; // handled by onBackgroundMessage
  event.waitUntil(ready.then(() => showPayload(payload)));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    (async () => {
      const clientList = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of clientList) {
        if ("focus" in client) {
          await client.focus();
          if ("navigate" in client) await client.navigate(target);
          return;
        }
      }
      await self.clients.openWindow(target);
    })(),
  );
});

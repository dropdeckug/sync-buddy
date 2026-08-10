/* Firebase Cloud Messaging service worker.
   Config is passed in via query params when the worker is registered,
   so no keys need to be hardcoded here. */
importScripts("https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js");

const params = new URL(self.location).searchParams;
const firebaseConfig = {
  apiKey: params.get("apiKey"),
  authDomain: params.get("authDomain"),
  projectId: params.get("projectId"),
  messagingSenderId: params.get("messagingSenderId"),
  appId: params.get("appId"),
};

if (firebaseConfig.projectId) {
  firebase.initializeApp(firebaseConfig);
  const messaging = firebase.messaging();

  messaging.onBackgroundMessage((payload) => {
    const data = payload.data || {};
    const notif = payload.notification || {};
    const progress = data.progress !== undefined ? Number(data.progress) : undefined;
    const repos = data.repos ? data.repos.split(",").filter(Boolean) : [];

    let body = notif.body || "";
    if (repos.length) {
      const shown = repos.slice(0, 5).map((r) => "• " + r).join("\n");
      body += "\n" + shown + (repos.length > 5 ? `\n• +${repos.length - 5} more` : "");
    }
    if (typeof progress === "number" && !Number.isNaN(progress)) {
      const filled = Math.round(progress / 10);
      body += `\n[${"█".repeat(filled)}${"░".repeat(10 - filled)}] ${progress}%`;
    }

    self.registration.showNotification(notif.title || "GitSync", {
      body,
      tag: data.tag || "gitsync",
      renotify: true,
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      data: { url: data.url || "/" },
      silent: typeof progress === "number" && progress > 0 && progress < 100,
    });
  });
}

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

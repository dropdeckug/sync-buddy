// Returns the publishable Firebase Web config so the browser (and the
// messaging service worker) can initialise Firebase Cloud Messaging.
// These values are safe to expose — they are client keys, not secrets.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve((req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const appId = Deno.env.get("FIREBASE_APP_ID") ?? "";
  // The sender id is embedded in the app id ("1:<senderId>:web:..."). Prefer it
  // over the standalone secret so a typo there can't break token requests.
  const senderFromAppId = appId.split(":")[1] ?? "";
  const config = {
    apiKey: Deno.env.get("FIREBASE_API_KEY") ?? "",
    authDomain: `${Deno.env.get("FIREBASE_PROJECT_ID") ?? ""}.firebaseapp.com`,
    projectId: Deno.env.get("FIREBASE_PROJECT_ID") ?? "",
    messagingSenderId: senderFromAppId || (Deno.env.get("FIREBASE_MESSAGING_SENDER_ID") ?? ""),
    appId,
  };
  const vapidKey = Deno.env.get("FIREBASE_VAPID_PUBLIC_KEY") ?? "";
  const configured = Boolean(config.apiKey && config.projectId && config.messagingSenderId && config.appId && vapidKey);


  return new Response(JSON.stringify({ configured, config, vapidKey }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});

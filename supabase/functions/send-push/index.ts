import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function pemToArrayBuffer(pem: string): ArrayBuffer {
  const b64 = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\s+/g, "");
  const raw = atob(b64);
  const buf = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) buf[i] = raw.charCodeAt(i);
  return buf.buffer;
}

function b64url(input: string | Uint8Array): string {
  const bytes = typeof input === "string" ? new TextEncoder().encode(input) : input;
  let str = "";
  for (const b of bytes) str += String.fromCharCode(b);
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

let cachedToken: { token: string; exp: number } | null = null;

async function getAccessToken(sa: { client_email: string; private_key: string }): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && cachedToken.exp - 60 > now) return cachedToken.token;

  const header = { alg: "RS256", typ: "JWT" };
  const claims = {
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  };
  const unsigned = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(claims))}`;
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToArrayBuffer(sa.private_key.replace(/\\n/g, "\n")),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sigBuf = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(unsigned),
  );
  const jwt = `${unsigned}.${b64url(new Uint8Array(sigBuf))}`;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });
  if (!res.ok) throw new Error(`Google OAuth failed: ${await res.text()}`);
  const json = await res.json();
  cachedToken = { token: json.access_token, exp: now + (json.expires_in ?? 3600) };
  return json.access_token;
}

interface PushBody {
  userId?: string;
  accountId?: string;
  title: string;
  body: string;
  tag?: string;
  url?: string;
  /** 0-100; renders a progress bar on Android and in the in-app handler */
  progress?: number;
  /** Small list of repository names shown in the notification */
  repos?: string[];
  data?: Record<string, string>;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const raw = Deno.env.get("FIREBASE_SERVICE_ACCOUNT_JSON");
    if (!raw) {
      return new Response(
        JSON.stringify({ error: "FIREBASE_SERVICE_ACCOUNT_JSON is not configured" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    const sa = JSON.parse(raw);
    const projectId: string = sa.project_id ?? Deno.env.get("FIREBASE_PROJECT_ID") ?? "";
    if (!projectId) throw new Error("Missing Firebase project id");

    const payload = (await req.json()) as PushBody;
    if (!payload?.title || !payload?.body) {
      return new Response(JSON.stringify({ error: "title and body are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    let userId = payload.userId;
    if (!userId && payload.accountId) {
      const { data: acct } = await supabase
        .from("github_accounts")
        .select("user_id")
        .eq("id", payload.accountId)
        .maybeSingle();
      userId = acct?.user_id ?? undefined;
    }
    if (!userId) {
      return new Response(JSON.stringify({ error: "No recipient resolved" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: tokens } = await supabase
      .from("push_tokens")
      .select("id, token")
      .eq("user_id", userId)
      .eq("enabled", true);

    if (!tokens || tokens.length === 0) {
      return new Response(JSON.stringify({ ok: true, sent: 0, reason: "no devices" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const accessToken = await getAccessToken(sa);
    const progress = typeof payload.progress === "number"
      ? Math.max(0, Math.min(100, Math.round(payload.progress)))
      : undefined;

    const dataPayload: Record<string, string> = {
      ...(payload.data ?? {}),
      url: payload.url ?? "/",
      ...(payload.tag ? { tag: payload.tag } : {}),
      ...(progress !== undefined ? { progress: String(progress) } : {}),
      ...(payload.repos?.length ? { repos: payload.repos.join(",") } : {}),
    };

    let sent = 0;
    const invalid: string[] = [];

    for (const t of tokens) {
      const message: Record<string, unknown> = {
        token: t.token,
        data: dataPayload,
        notification: { title: payload.title, body: payload.body },
        webpush: {
          headers: { Urgency: "high", TTL: "300" },
          notification: {
            title: payload.title,
            body: payload.body,
            icon: "/icon-192.png",
            tag: payload.tag ?? "gitsync",
            renotify: true,
            requireInteraction: progress !== undefined && progress < 100,
          },
          fcm_options: { link: payload.url ?? "/" },
        },
        android: {
          notification: {
            tag: payload.tag ?? "gitsync",
            ...(progress !== undefined
              ? { notification_priority: "PRIORITY_DEFAULT" }
              : {}),
          },
        },
      };

      const res = await fetch(
        `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ message }),
        },
      );

      if (res.ok) {
        sent++;
      } else {
        const errText = await res.text();
        console.error(`FCM send failed for token ${t.id}: ${errText}`);
        if (res.status === 404 || errText.includes("UNREGISTERED") || errText.includes("INVALID_ARGUMENT")) {
          invalid.push(t.id);
        }
      }
    }

    if (invalid.length) {
      await supabase.from("push_tokens").delete().in("id", invalid);
    }

    return new Response(JSON.stringify({ ok: true, sent, pruned: invalid.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("send-push error", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

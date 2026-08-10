// Fire-and-forget push notification helper used by sync + webhook functions.
export interface PushPayload {
  userId?: string;
  accountId?: string;
  title: string;
  body: string;
  tag?: string;
  url?: string;
  progress?: number;
  repos?: string[];
  data?: Record<string, string>;
}

export async function sendPush(payload: PushPayload): Promise<void> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) return;
  try {
    const res = await fetch(`${supabaseUrl}/functions/v1/send-push`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${serviceKey}`,
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) console.error("send-push failed:", await res.text());
  } catch (e) {
    console.error("send-push error:", e);
  }
}

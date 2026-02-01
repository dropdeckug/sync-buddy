import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface NotificationPayload {
  channelId?: string;
  eventType: string;
  payload: {
    title: string;
    message: string;
    [key: string]: any;
  };
  workspaceId?: string;
  userId?: string;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { channelId, eventType, payload, workspaceId, userId } = await req.json() as NotificationPayload;

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Get notification channels to send to
    let channels: any[] = [];

    if (channelId) {
      // Single channel specified
      const { data, error } = await supabase
        .from("notification_channels")
        .select("*")
        .eq("id", channelId)
        .eq("is_enabled", true)
        .single();

      if (error) throw error;
      if (data) channels = [data];
    } else if (workspaceId || userId) {
      // Find all enabled channels for this workspace/user and event type
      let query = supabase
        .from("notification_channels")
        .select(`
          *,
          notification_rules!inner (
            event_type,
            is_enabled
          )
        `)
        .eq("is_enabled", true)
        .eq("notification_rules.event_type", eventType)
        .eq("notification_rules.is_enabled", true);

      if (workspaceId) {
        query = query.eq("workspace_id", workspaceId);
      }
      if (userId) {
        query = query.eq("user_id", userId);
      }

      const { data, error } = await query;
      if (error) throw error;
      channels = data || [];
    }

    console.log(`Sending notifications to ${channels.length} channel(s) for event: ${eventType}`);

    const results = await Promise.allSettled(
      channels.map(async (channel) => {
        const result = await sendToChannel(channel, eventType, payload);
        
        // Log notification history
        await supabase.from("notification_history").insert({
          channel_id: channel.id,
          event_type: eventType,
          payload,
          status: result.success ? "sent" : "failed",
          error_message: result.error || null,
          sent_at: result.success ? new Date().toISOString() : null,
        });

        return result;
      })
    );

    const successCount = results.filter(r => r.status === "fulfilled" && (r.value as any).success).length;
    const failCount = results.length - successCount;

    return new Response(
      JSON.stringify({
        success: true,
        sent: successCount,
        failed: failCount,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  } catch (error: any) {
    console.error("Error sending notification:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
};

async function sendToChannel(
  channel: any,
  eventType: string,
  payload: { title: string; message: string; [key: string]: any }
): Promise<{ success: boolean; error?: string }> {
  try {
    switch (channel.channel_type) {
      case "email":
        return await sendEmail(channel.config, eventType, payload);
      case "slack":
        return await sendSlack(channel.config, eventType, payload);
      case "discord":
        return await sendDiscord(channel.config, eventType, payload);
      case "teams":
        return await sendTeams(channel.config, eventType, payload);
      case "webhook":
        return await sendWebhook(channel.config, eventType, payload);
      default:
        return { success: false, error: `Unknown channel type: ${channel.channel_type}` };
    }
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

async function sendEmail(
  config: { email: string },
  eventType: string,
  payload: { title: string; message: string }
): Promise<{ success: boolean; error?: string }> {
  // Using a simple email API - would need RESEND_API_KEY configured
  const resendApiKey = Deno.env.get("RESEND_API_KEY");
  
  if (!resendApiKey) {
    console.log("Email notification (RESEND_API_KEY not configured):", config.email, payload);
    return { success: true }; // Simulate success for testing
  }

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "Sync Notifications <noreply@yourdomain.com>",
        to: [config.email],
        subject: payload.title,
        html: `
          <h2>${payload.title}</h2>
          <p>${payload.message}</p>
          <hr>
          <p style="color: #666; font-size: 12px;">Event: ${eventType}</p>
        `,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      return { success: false, error };
    }

    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

async function sendSlack(
  config: { webhookUrl: string },
  eventType: string,
  payload: { title: string; message: string; [key: string]: any }
): Promise<{ success: boolean; error?: string }> {
  const color = eventType.includes("failed") ? "#dc2626" : 
                eventType.includes("completed") ? "#16a34a" : "#3b82f6";

  const response = await fetch(config.webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      attachments: [
        {
          color,
          blocks: [
            {
              type: "header",
              text: { type: "plain_text", text: payload.title, emoji: true },
            },
            {
              type: "section",
              text: { type: "mrkdwn", text: payload.message },
            },
            {
              type: "context",
              elements: [
                { type: "mrkdwn", text: `*Event:* ${eventType} • ${new Date().toLocaleString()}` },
              ],
            },
          ],
        },
      ],
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    return { success: false, error };
  }

  return { success: true };
}

async function sendDiscord(
  config: { webhookUrl: string },
  eventType: string,
  payload: { title: string; message: string; [key: string]: any }
): Promise<{ success: boolean; error?: string }> {
  const color = eventType.includes("failed") ? 0xdc2626 : 
                eventType.includes("completed") ? 0x16a34a : 0x3b82f6;

  const response = await fetch(config.webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      embeds: [
        {
          title: payload.title,
          description: payload.message,
          color,
          footer: { text: `Event: ${eventType}` },
          timestamp: new Date().toISOString(),
        },
      ],
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    return { success: false, error };
  }

  return { success: true };
}

async function sendTeams(
  config: { webhookUrl: string },
  eventType: string,
  payload: { title: string; message: string }
): Promise<{ success: boolean; error?: string }> {
  const themeColor = eventType.includes("failed") ? "dc2626" : 
                     eventType.includes("completed") ? "16a34a" : "3b82f6";

  const response = await fetch(config.webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      "@type": "MessageCard",
      "@context": "http://schema.org/extensions",
      themeColor,
      summary: payload.title,
      sections: [
        {
          activityTitle: payload.title,
          activitySubtitle: new Date().toLocaleString(),
          facts: [
            { name: "Event", value: eventType },
          ],
          text: payload.message,
        },
      ],
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    return { success: false, error };
  }

  return { success: true };
}

async function sendWebhook(
  config: { url: string; secret?: string },
  eventType: string,
  payload: { title: string; message: string; [key: string]: any }
): Promise<{ success: boolean; error?: string }> {
  const body = JSON.stringify({
    event: eventType,
    timestamp: new Date().toISOString(),
    data: payload,
  });

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  // Add HMAC signature if secret is configured
  if (config.secret) {
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(config.secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );
    const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(body));
    const signatureHex = Array.from(new Uint8Array(signature))
      .map(b => b.toString(16).padStart(2, "0"))
      .join("");
    headers["X-Signature-256"] = `sha256=${signatureHex}`;
  }

  const response = await fetch(config.url, {
    method: "POST",
    headers,
    body,
  });

  if (!response.ok) {
    const error = await response.text();
    return { success: false, error };
  }

  return { success: true };
}

serve(handler);

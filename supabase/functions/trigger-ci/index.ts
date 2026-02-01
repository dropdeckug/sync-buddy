import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface TriggerCIRequest {
  syncGroupId: string;
  syncHistoryId?: string;
  accessToken: string;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { syncGroupId, syncHistoryId, accessToken } = await req.json() as TriggerCIRequest;

    if (!syncGroupId || !accessToken) {
      throw new Error("Missing required parameters");
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Get CI triggers for this sync group
    const { data: triggers, error: triggersError } = await supabase
      .from("ci_triggers")
      .select("*")
      .eq("sync_group_id", syncGroupId)
      .eq("is_enabled", true);

    if (triggersError) throw triggersError;

    if (!triggers || triggers.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          message: "No CI triggers configured",
          triggered: 0,
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        }
      );
    }

    console.log(`Triggering ${triggers.length} CI workflow(s)`);

    const results = await Promise.allSettled(
      triggers.map(async (trigger) => {
        // Create CI run record
        const { data: run, error: runError } = await supabase
          .from("ci_runs")
          .insert({
            trigger_id: trigger.id,
            sync_history_id: syncHistoryId || null,
            status: "pending",
          })
          .select()
          .single();

        if (runError) throw runError;

        try {
          let result;

          switch (trigger.trigger_type) {
            case "github_actions":
              result = await triggerGitHubActions(trigger.config, accessToken);
              break;
            case "jenkins":
              result = await triggerJenkins(trigger.config);
              break;
            case "circleci":
              result = await triggerCircleCI(trigger.config);
              break;
            case "custom":
              result = await triggerCustomWebhook(trigger.config);
              break;
            default:
              throw new Error(`Unknown trigger type: ${trigger.trigger_type}`);
          }

          // Update run with result
          await supabase
            .from("ci_runs")
            .update({
              status: "running",
              run_url: result.url || null,
              started_at: new Date().toISOString(),
            })
            .eq("id", run.id);

          return { triggerId: trigger.id, runId: run.id, ...result };
        } catch (error: any) {
          // Update run with failure
          await supabase
            .from("ci_runs")
            .update({
              status: "failure",
              completed_at: new Date().toISOString(),
            })
            .eq("id", run.id);

          throw error;
        }
      })
    );

    const successful = results.filter(r => r.status === "fulfilled").length;
    const failed = results.filter(r => r.status === "rejected").length;

    return new Response(
      JSON.stringify({
        success: true,
        triggered: successful,
        failed,
        results: results.map((r, i) => ({
          triggerId: triggers[i].id,
          triggerName: triggers[i].name,
          status: r.status,
          ...(r.status === "fulfilled" ? (r as any).value : { error: (r as any).reason?.message }),
        })),
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  } catch (error: any) {
    console.error("Error triggering CI:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
};

async function triggerGitHubActions(
  config: { repoFullName: string; workflowId: string; ref?: string; inputs?: Record<string, string> },
  accessToken: string
): Promise<{ success: boolean; url?: string }> {
  const response = await fetch(
    `https://api.github.com/repos/${config.repoFullName}/actions/workflows/${config.workflowId}/dispatches`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/vnd.github.v3+json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ref: config.ref || "main",
        inputs: config.inputs || {},
      }),
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`GitHub Actions trigger failed: ${error}`);
  }

  return {
    success: true,
    url: `https://github.com/${config.repoFullName}/actions`,
  };
}

async function triggerJenkins(
  config: { url: string; jobName: string; token?: string; user?: string; apiToken?: string }
): Promise<{ success: boolean; url?: string }> {
  const jenkinsUrl = `${config.url}/job/${config.jobName}/build`;
  const headers: Record<string, string> = {};

  if (config.user && config.apiToken) {
    headers.Authorization = `Basic ${btoa(`${config.user}:${config.apiToken}`)}`;
  }

  if (config.token) {
    const tokenUrl = `${jenkinsUrl}?token=${config.token}`;
    const response = await fetch(tokenUrl, { method: "POST", headers });

    if (!response.ok && response.status !== 201) {
      throw new Error(`Jenkins trigger failed: ${response.status}`);
    }
  } else {
    const response = await fetch(jenkinsUrl, { method: "POST", headers });

    if (!response.ok && response.status !== 201) {
      throw new Error(`Jenkins trigger failed: ${response.status}`);
    }
  }

  return {
    success: true,
    url: `${config.url}/job/${config.jobName}`,
  };
}

async function triggerCircleCI(
  config: { projectSlug: string; branch?: string; parameters?: Record<string, any>; apiToken: string }
): Promise<{ success: boolean; url?: string }> {
  const response = await fetch(
    `https://circleci.com/api/v2/project/${config.projectSlug}/pipeline`,
    {
      method: "POST",
      headers: {
        "Circle-Token": config.apiToken,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        branch: config.branch || "main",
        parameters: config.parameters || {},
      }),
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`CircleCI trigger failed: ${error}`);
  }

  const data = await response.json();

  return {
    success: true,
    url: `https://app.circleci.com/pipelines/${config.projectSlug}/${data.number}`,
  };
}

async function triggerCustomWebhook(
  config: { url: string; method?: string; headers?: Record<string, string>; body?: any; secret?: string }
): Promise<{ success: boolean; url?: string }> {
  const method = config.method || "POST";
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...config.headers,
  };

  const body = JSON.stringify(config.body || { triggered: true, timestamp: new Date().toISOString() });

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
    method,
    headers,
    body: method !== "GET" ? body : undefined,
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Custom webhook failed: ${error}`);
  }

  return {
    success: true,
    url: config.url,
  };
}

serve(handler);

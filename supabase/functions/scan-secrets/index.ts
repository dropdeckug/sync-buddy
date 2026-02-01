import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Common secret patterns to detect
const SECRET_PATTERNS = [
  { type: "aws_access_key", pattern: /AKIA[0-9A-Z]{16}/g },
  { type: "aws_secret_key", pattern: /(?<![A-Za-z0-9/+=])[A-Za-z0-9/+=]{40}(?![A-Za-z0-9/+=])/g, context: "aws" },
  { type: "github_token", pattern: /gh[pousr]_[A-Za-z0-9_]{36,255}/g },
  { type: "github_token", pattern: /github_pat_[A-Za-z0-9_]{82}/g },
  { type: "private_key", pattern: /-----BEGIN (RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/g },
  { type: "stripe_key", pattern: /sk_live_[0-9a-zA-Z]{24,}/g },
  { type: "stripe_key", pattern: /rk_live_[0-9a-zA-Z]{24,}/g },
  { type: "slack_token", pattern: /xox[baprs]-[0-9]{10,13}-[0-9]{10,13}[a-zA-Z0-9-]*/g },
  { type: "slack_webhook", pattern: /https:\/\/hooks\.slack\.com\/services\/T[a-zA-Z0-9_]+\/B[a-zA-Z0-9_]+\/[a-zA-Z0-9_]+/g },
  { type: "database_url", pattern: /(?:postgres|mysql|mongodb):\/\/[^:]+:[^@]+@[^/]+/g },
  { type: "jwt_secret", pattern: /eyJ[A-Za-z0-9-_=]+\.eyJ[A-Za-z0-9-_=]+\.?[A-Za-z0-9-_.+/=]*/g },
  { type: "api_key", pattern: /(?:api[_-]?key|apikey)['":\s=]+['"]?([a-zA-Z0-9_-]{20,})['"]?/gi },
  { type: "password", pattern: /(?:password|passwd|pwd)['":\s=]+['"]?([^\s'"]{8,})['"]?/gi },
  { type: "generic_secret", pattern: /(?:secret|token|auth)['":\s=]+['"]?([a-zA-Z0-9_-]{20,})['"]?/gi },
];

// Files to skip
const SKIP_FILES = [
  ".env.example",
  ".env.sample",
  "package-lock.json",
  "yarn.lock",
  "pnpm-lock.yaml",
  ".min.js",
  ".min.css",
  "node_modules",
  ".git",
];

interface ScanRequest {
  syncGroupId: string;
  files?: { path: string; content: string }[];
  accessToken?: string;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { syncGroupId, files, accessToken } = await req.json() as ScanRequest;

    if (!syncGroupId) {
      throw new Error("syncGroupId is required");
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Get sync group and repos
    const { data: syncGroup, error: groupError } = await supabase
      .from("sync_groups")
      .select(`
        *,
        repos!sync_groups_mother_repo_id_fkey (*)
      `)
      .eq("id", syncGroupId)
      .single();

    if (groupError) throw groupError;

    let filesToScan = files || [];

    // If no files provided, fetch from GitHub
    if (filesToScan.length === 0 && accessToken) {
      const motherRepo = syncGroup.repos;
      if (motherRepo) {
        filesToScan = await fetchRepoFiles(motherRepo.full_name, accessToken);
      }
    }

    console.log(`Scanning ${filesToScan.length} files for secrets...`);

    const detectedSecrets: Array<{
      file_path: string;
      secret_type: string;
      line_number: number | null;
    }> = [];

    for (const file of filesToScan) {
      // Skip certain files
      if (SKIP_FILES.some(skip => file.path.includes(skip))) {
        continue;
      }

      const secrets = scanFileForSecrets(file.path, file.content);
      detectedSecrets.push(...secrets);
    }

    console.log(`Found ${detectedSecrets.length} potential secrets`);

    // Get existing detected secrets to avoid duplicates
    const { data: existingSecrets } = await supabase
      .from("detected_secrets")
      .select("file_path, secret_type, line_number")
      .eq("sync_group_id", syncGroupId)
      .is("resolved_at", null);

    const existingSet = new Set(
      (existingSecrets || []).map(s => `${s.file_path}:${s.secret_type}:${s.line_number}`)
    );

    // Filter out duplicates
    const newSecrets = detectedSecrets.filter(
      s => !existingSet.has(`${s.file_path}:${s.secret_type}:${s.line_number}`)
    );

    // Insert new secrets
    if (newSecrets.length > 0) {
      const { error: insertError } = await supabase
        .from("detected_secrets")
        .insert(
          newSecrets.map(s => ({
            sync_group_id: syncGroupId,
            ...s,
          }))
        );

      if (insertError) throw insertError;

      // Send notification for new secrets
      if (newSecrets.length > 0) {
        await supabase.functions.invoke("send-notification", {
          body: {
            workspaceId: syncGroup.workspace_id,
            eventType: "secret_detected",
            payload: {
              title: `⚠️ ${newSecrets.length} Secret(s) Detected`,
              message: `Found ${newSecrets.length} potential secrets in ${syncGroup.name}. Please review and resolve them immediately.`,
              secrets: newSecrets.slice(0, 5), // Limit to first 5 in notification
            },
          },
        });
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        scannedFiles: filesToScan.length,
        totalFound: detectedSecrets.length,
        newFindings: newSecrets.length,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  } catch (error: any) {
    console.error("Error scanning for secrets:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
};

function scanFileForSecrets(
  filePath: string,
  content: string
): Array<{ file_path: string; secret_type: string; line_number: number | null }> {
  const findings: Array<{ file_path: string; secret_type: string; line_number: number | null }> = [];
  const lines = content.split("\n");

  for (const { type, pattern } of SECRET_PATTERNS) {
    // Reset regex state
    pattern.lastIndex = 0;

    for (let lineNum = 0; lineNum < lines.length; lineNum++) {
      const line = lines[lineNum];
      
      // Skip comments in most languages
      const trimmedLine = line.trim();
      if (trimmedLine.startsWith("//") || trimmedLine.startsWith("#") || trimmedLine.startsWith("*")) {
        continue;
      }

      pattern.lastIndex = 0;
      if (pattern.test(line)) {
        // Avoid duplicates for the same line
        if (!findings.some(f => f.file_path === filePath && f.line_number === lineNum + 1 && f.secret_type === type)) {
          findings.push({
            file_path: filePath,
            secret_type: type,
            line_number: lineNum + 1,
          });
        }
      }
    }
  }

  return findings;
}

async function fetchRepoFiles(
  repoFullName: string,
  accessToken: string
): Promise<Array<{ path: string; content: string }>> {
  const files: Array<{ path: string; content: string }> = [];

  try {
    // Get repo tree
    const treeResponse = await fetch(
      `https://api.github.com/repos/${repoFullName}/git/trees/HEAD?recursive=1`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/vnd.github.v3+json",
        },
      }
    );

    if (!treeResponse.ok) {
      console.error("Failed to fetch repo tree");
      return files;
    }

    const tree = await treeResponse.json();

    // Filter to text files only
    const textFiles = tree.tree
      .filter((item: any) => {
        if (item.type !== "blob") return false;
        const ext = item.path.split(".").pop()?.toLowerCase() || "";
        const textExtensions = ["js", "ts", "jsx", "tsx", "py", "rb", "go", "java", "json", "yaml", "yml", "env", "cfg", "conf", "ini", "sh", "bash", "zsh", "md", "txt"];
        return textExtensions.includes(ext) || item.path.includes(".env");
      })
      .slice(0, 100); // Limit to 100 files for performance

    // Fetch content for each file
    for (const file of textFiles) {
      try {
        const contentResponse = await fetch(
          `https://api.github.com/repos/${repoFullName}/contents/${file.path}`,
          {
            headers: {
              Authorization: `Bearer ${accessToken}`,
              Accept: "application/vnd.github.v3.raw",
            },
          }
        );

        if (contentResponse.ok) {
          const content = await contentResponse.text();
          files.push({ path: file.path, content });
        }
      } catch (e) {
        console.error(`Failed to fetch ${file.path}:`, e);
      }
    }
  } catch (error) {
    console.error("Error fetching repo files:", error);
  }

  return files;
}

serve(handler);

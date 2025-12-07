import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface WebhookRequest {
  repoFullName: string;
  accessToken: string;
  action: 'register' | 'unregister' | 'check';
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { repoFullName, accessToken, action = 'register' } = await req.json() as WebhookRequest;

    if (!repoFullName || !accessToken) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const webhookSecret = Deno.env.get('GITHUB_WEBHOOK_SECRET');
    const webhookUrl = `${supabaseUrl}/functions/v1/github-webhook`;

    const [owner, repo] = repoFullName.split('/');

    if (action === 'check') {
      // Check if webhook already exists
      const listResponse = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/hooks`,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Accept': 'application/vnd.github.v3+json',
            'User-Agent': 'RepoSync-App',
          },
        }
      );

      if (!listResponse.ok) {
        const error = await listResponse.text();
        console.error('Failed to list webhooks:', error);
        return new Response(JSON.stringify({ 
          registered: false, 
          error: 'Failed to check webhooks' 
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        });
      }

      const hooks = await listResponse.json();
      const existingHook = hooks.find((hook: any) => 
        hook.config?.url === webhookUrl
      );

      return new Response(JSON.stringify({ 
        registered: !!existingHook,
        hookId: existingHook?.id,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      });
    }

    if (action === 'unregister') {
      // First, find the webhook
      const listResponse = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/hooks`,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Accept': 'application/vnd.github.v3+json',
            'User-Agent': 'RepoSync-App',
          },
        }
      );

      if (!listResponse.ok) {
        return new Response(JSON.stringify({ error: 'Failed to list webhooks' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400,
        });
      }

      const hooks = await listResponse.json();
      const existingHook = hooks.find((hook: any) => 
        hook.config?.url === webhookUrl
      );

      if (!existingHook) {
        return new Response(JSON.stringify({ 
          success: true, 
          message: 'Webhook not found' 
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        });
      }

      // Delete the webhook
      const deleteResponse = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/hooks/${existingHook.id}`,
        {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Accept': 'application/vnd.github.v3+json',
            'User-Agent': 'RepoSync-App',
          },
        }
      );

      if (!deleteResponse.ok && deleteResponse.status !== 204) {
        const error = await deleteResponse.text();
        console.error('Failed to delete webhook:', error);
        return new Response(JSON.stringify({ error: 'Failed to delete webhook' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400,
        });
      }

      console.log(`Webhook unregistered for ${repoFullName}`);
      return new Response(JSON.stringify({ 
        success: true, 
        message: 'Webhook unregistered' 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      });
    }

    // Register webhook
    console.log(`Registering webhook for ${repoFullName}`);

    // First check if webhook already exists
    const listResponse = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/hooks`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'RepoSync-App',
        },
      }
    );

    if (listResponse.ok) {
      const hooks = await listResponse.json();
      const existingHook = hooks.find((hook: any) => 
        hook.config?.url === webhookUrl
      );

      if (existingHook) {
        console.log(`Webhook already exists for ${repoFullName}`);
        return new Response(JSON.stringify({ 
          success: true, 
          message: 'Webhook already registered',
          hookId: existingHook.id,
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        });
      }
    }

    // Create new webhook
    const webhookConfig: any = {
      name: 'web',
      active: true,
      events: ['push'],
      config: {
        url: webhookUrl,
        content_type: 'json',
        insecure_ssl: '0',
      },
    };

    // Add secret if configured
    if (webhookSecret) {
      webhookConfig.config.secret = webhookSecret;
    }

    const createResponse = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/hooks`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/vnd.github.v3+json',
          'Content-Type': 'application/json',
          'User-Agent': 'RepoSync-App',
        },
        body: JSON.stringify(webhookConfig),
      }
    );

    if (!createResponse.ok) {
      const error = await createResponse.text();
      console.error('Failed to create webhook:', error);
      
      // Check if it's a permission error
      if (createResponse.status === 404) {
        return new Response(JSON.stringify({ 
          error: 'Repository not found or insufficient permissions. Make sure you have admin access to the repository.' 
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 403,
        });
      }
      
      return new Response(JSON.stringify({ error: 'Failed to create webhook' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      });
    }

    const newHook = await createResponse.json();
    console.log(`Webhook created for ${repoFullName}: ${newHook.id}`);

    return new Response(JSON.stringify({ 
      success: true, 
      message: 'Webhook registered',
      hookId: newHook.id,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Register webhook error:', error);
    return new Response(JSON.stringify({ error: errorMessage }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});

import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Webhook, Check, X, Loader2, RefreshCw, AlertTriangle } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface Repo {
  id: string;
  name: string;
  full_name: string;
}

interface WebhookStatus {
  repoFullName: string;
  registered: boolean;
  loading: boolean;
  hookId?: number;
  error?: string;
}

interface WebhookManagerProps {
  repos: Repo[];
  accessToken: string;
  showBulkActions?: boolean;
}

export const WebhookManager = ({ repos, accessToken, showBulkActions = true }: WebhookManagerProps) => {
  const [webhookStatuses, setWebhookStatuses] = useState<Record<string, WebhookStatus>>({});
  const [isCheckingAll, setIsCheckingAll] = useState(false);
  const [isRegisteringAll, setIsRegisteringAll] = useState(false);
  const { toast } = useToast();

  // Check webhook status for a single repo
  const checkWebhookStatus = async (repoFullName: string) => {
    setWebhookStatuses(prev => ({
      ...prev,
      [repoFullName]: { ...prev[repoFullName], repoFullName, loading: true },
    }));

    try {
      const { data, error } = await supabase.functions.invoke('register-webhook', {
        body: { repoFullName, accessToken, action: 'check' },
      });

      if (error) throw error;

      setWebhookStatuses(prev => ({
        ...prev,
        [repoFullName]: {
          repoFullName,
          registered: data?.registered || false,
          loading: false,
          hookId: data?.hookId,
        },
      }));
    } catch (err: any) {
      setWebhookStatuses(prev => ({
        ...prev,
        [repoFullName]: {
          repoFullName,
          registered: false,
          loading: false,
          error: err.message || 'Failed to check',
        },
      }));
    }
  };

  // Register webhook for a single repo
  const registerWebhook = async (repoFullName: string) => {
    setWebhookStatuses(prev => ({
      ...prev,
      [repoFullName]: { ...prev[repoFullName], repoFullName, loading: true },
    }));

    try {
      const { data, error } = await supabase.functions.invoke('register-webhook', {
        body: { repoFullName, accessToken, action: 'register' },
      });

      if (error) throw error;

      setWebhookStatuses(prev => ({
        ...prev,
        [repoFullName]: {
          repoFullName,
          registered: data?.success || false,
          loading: false,
          hookId: data?.hookId,
        },
      }));

      toast({
        title: "Webhook registered",
        description: `Webhook registered for ${repoFullName}`,
      });
    } catch (err: any) {
      setWebhookStatuses(prev => ({
        ...prev,
        [repoFullName]: {
          repoFullName,
          registered: false,
          loading: false,
          error: err.message || 'Failed to register',
        },
      }));

      toast({
        title: "Failed to register webhook",
        description: err.message,
        variant: "destructive",
      });
    }
  };

  // Check all webhooks
  const checkAllWebhooks = async () => {
    setIsCheckingAll(true);
    for (const repo of repos) {
      await checkWebhookStatus(repo.full_name);
    }
    setIsCheckingAll(false);
  };

  // Register all missing webhooks
  const registerAllMissing = async () => {
    setIsRegisteringAll(true);
    let registered = 0;
    
    for (const repo of repos) {
      const status = webhookStatuses[repo.full_name];
      if (!status?.registered && !status?.loading) {
        await registerWebhook(repo.full_name);
        registered++;
      }
    }

    setIsRegisteringAll(false);
    
    if (registered > 0) {
      toast({
        title: "Webhooks registered",
        description: `Registered ${registered} webhook(s)`,
      });
    }
  };

  // Auto-check on mount
  useEffect(() => {
    if (repos.length > 0 && accessToken) {
      checkAllWebhooks();
    }
  }, [repos.length, accessToken]);

  const getStatusIcon = (status: WebhookStatus | undefined) => {
    if (!status || status.loading) {
      return <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />;
    }
    if (status.error) {
      return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
    }
    if (status.registered) {
      return <Check className="h-4 w-4 text-green-500" />;
    }
    return <X className="h-4 w-4 text-destructive" />;
  };

  const getStatusBadge = (status: WebhookStatus | undefined) => {
    if (!status || status.loading) {
      return <Badge variant="secondary" className="text-xs">Checking...</Badge>;
    }
    if (status.error) {
      return <Badge variant="outline" className="text-xs text-yellow-500 border-yellow-500">Error</Badge>;
    }
    if (status.registered) {
      return <Badge variant="outline" className="text-xs text-green-500 border-green-500">Active</Badge>;
    }
    return <Badge variant="outline" className="text-xs text-destructive border-destructive">Not registered</Badge>;
  };

  const missingCount = repos.filter(r => {
    const status = webhookStatuses[r.full_name];
    return status && !status.registered && !status.loading;
  }).length;

  const allChecked = repos.every(r => webhookStatuses[r.full_name] && !webhookStatuses[r.full_name].loading);

  return (
    <div className="space-y-4">
      {showBulkActions && (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Webhook className="h-5 w-5 text-primary" />
            <span className="font-medium">Webhook Status</span>
            {allChecked && missingCount > 0 && (
              <Badge variant="destructive" className="text-xs">
                {missingCount} missing
              </Badge>
            )}
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={checkAllWebhooks}
              disabled={isCheckingAll || isRegisteringAll}
            >
              {isCheckingAll ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <RefreshCw className="h-4 w-4 mr-2" />
              )}
              Check All
            </Button>
            {missingCount > 0 && (
              <Button
                size="sm"
                onClick={registerAllMissing}
                disabled={isCheckingAll || isRegisteringAll}
              >
                {isRegisteringAll ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Webhook className="h-4 w-4 mr-2" />
                )}
                Register All ({missingCount})
              </Button>
            )}
          </div>
        </div>
      )}

      <div className="space-y-2">
        {repos.map(repo => {
          const status = webhookStatuses[repo.full_name];
          return (
            <div
              key={repo.id}
              className="flex items-center justify-between p-3 border rounded-lg bg-card"
            >
              <div className="flex items-center gap-3">
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger>
                      {getStatusIcon(status)}
                    </TooltipTrigger>
                    <TooltipContent>
                      {status?.error || (status?.registered ? 'Webhook active' : 'No webhook')}
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
                <div>
                  <p className="font-medium text-sm">{repo.name}</p>
                  <p className="text-xs text-muted-foreground">{repo.full_name}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {getStatusBadge(status)}
                {status && !status.registered && !status.loading && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => registerWebhook(repo.full_name)}
                  >
                    Register
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export const WebhookStatusIndicator = ({ 
  repoFullName, 
  accessToken 
}: { 
  repoFullName: string; 
  accessToken: string;
}) => {
  const [status, setStatus] = useState<{ registered: boolean; loading: boolean; error?: string }>({
    registered: false,
    loading: true,
  });

  useEffect(() => {
    const checkStatus = async () => {
      try {
        const { data, error } = await supabase.functions.invoke('register-webhook', {
          body: { repoFullName, accessToken, action: 'check' },
        });
        if (error) throw error;
        setStatus({ registered: data?.registered || false, loading: false });
      } catch (err: any) {
        setStatus({ registered: false, loading: false, error: err.message });
      }
    };
    
    if (accessToken) {
      checkStatus();
    }
  }, [repoFullName, accessToken]);

  if (status.loading) {
    return <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />;
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger>
          {status.registered ? (
            <Webhook className="h-3 w-3 text-green-500" />
          ) : (
            <Webhook className="h-3 w-3 text-muted-foreground opacity-50" />
          )}
        </TooltipTrigger>
        <TooltipContent>
          {status.registered ? 'Webhook active' : 'No webhook registered'}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};

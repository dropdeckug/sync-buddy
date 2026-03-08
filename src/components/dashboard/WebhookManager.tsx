import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Webhook, Check, X, Loader2, RefreshCw, AlertTriangle,
  GitBranch, Shield, Zap, CircleDot
} from "lucide-react";
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
        [repoFullName]: { repoFullName, registered: data?.registered || false, loading: false, hookId: data?.hookId },
      }));
    } catch (err: any) {
      setWebhookStatuses(prev => ({
        ...prev,
        [repoFullName]: { repoFullName, registered: false, loading: false, error: err.message || 'Failed to check' },
      }));
    }
  };

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
        [repoFullName]: { repoFullName, registered: data?.success || false, loading: false, hookId: data?.hookId },
      }));
      toast({ title: "Webhook registered", description: `Webhook registered for ${repoFullName}` });
    } catch (err: any) {
      setWebhookStatuses(prev => ({
        ...prev,
        [repoFullName]: { repoFullName, registered: false, loading: false, error: err.message || 'Failed to register' },
      }));
      toast({ title: "Failed to register webhook", description: err.message, variant: "destructive" });
    }
  };

  const checkAllWebhooks = async () => {
    setIsCheckingAll(true);
    for (const repo of repos) {
      await checkWebhookStatus(repo.full_name);
    }
    setIsCheckingAll(false);
  };

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
      toast({ title: "Webhooks registered", description: `Registered ${registered} webhook(s)` });
    }
  };

  useEffect(() => {
    if (repos.length > 0 && accessToken) {
      checkAllWebhooks();
    }
  }, [repos.length, accessToken]);

  const missingCount = repos.filter(r => {
    const status = webhookStatuses[r.full_name];
    return status && !status.registered && !status.loading;
  }).length;

  const activeCount = repos.filter(r => webhookStatuses[r.full_name]?.registered).length;
  const allChecked = repos.every(r => webhookStatuses[r.full_name] && !webhookStatuses[r.full_name].loading);

  return (
    <div className="space-y-4">
      {showBulkActions && (
        <>
          {/* Stats Row */}
          <div className="grid grid-cols-3 gap-2">
            <div className="p-3 rounded-xl bg-primary/8 border border-primary/15">
              <div className="flex items-center gap-1.5">
                <Zap className="h-3.5 w-3.5 text-primary" />
                <span className="text-lg font-bold text-primary">{activeCount}</span>
              </div>
              <p className="text-[10px] text-muted-foreground mt-0.5">Active</p>
            </div>
            <div className="p-3 rounded-xl bg-destructive/8 border border-destructive/15">
              <div className="flex items-center gap-1.5">
                <X className="h-3.5 w-3.5 text-destructive" />
                <span className="text-lg font-bold text-destructive">{missingCount}</span>
              </div>
              <p className="text-[10px] text-muted-foreground mt-0.5">Missing</p>
            </div>
            <div className="p-3 rounded-xl bg-muted/30 border border-border/30">
              <div className="flex items-center gap-1.5">
                <GitBranch className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-lg font-bold">{repos.length}</span>
              </div>
              <p className="text-[10px] text-muted-foreground mt-0.5">Total</p>
            </div>
          </div>

          {/* Bulk actions */}
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={checkAllWebhooks}
              disabled={isCheckingAll || isRegisteringAll}
              className="flex-1 rounded-xl gap-1.5 text-xs h-9"
            >
              {isCheckingAll ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              Refresh Status
            </Button>
            {missingCount > 0 && (
              <Button
                size="sm"
                onClick={registerAllMissing}
                disabled={isCheckingAll || isRegisteringAll}
                className="flex-1 rounded-xl gap-1.5 text-xs h-9"
              >
                {isRegisteringAll ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Webhook className="h-3.5 w-3.5" />}
                Register All ({missingCount})
              </Button>
            )}
          </div>

          <Separator className="bg-border/20" />
        </>
      )}

      {/* Repository List */}
      <ScrollArea className="max-h-[400px]">
        <div className="space-y-1.5">
          {repos.map(repo => {
            const status = webhookStatuses[repo.full_name];
            const isLoading = !status || status.loading;
            const isActive = status?.registered;
            const hasError = status?.error;

            return (
              <div
                key={repo.id}
                className={`flex items-center justify-between p-3 rounded-xl border transition-all ${
                  isActive
                    ? "bg-primary/5 border-primary/15"
                    : hasError
                    ? "bg-destructive/5 border-destructive/15"
                    : "bg-muted/15 border-border/30"
                }`}
              >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  {/* Status indicator */}
                  <div className={`h-8 w-8 rounded-lg flex items-center justify-center shrink-0 ${
                    isLoading ? "bg-muted/30" : isActive ? "bg-primary/15" : hasError ? "bg-destructive/15" : "bg-muted/30"
                  }`}>
                    {isLoading ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                    ) : isActive ? (
                      <Check className="h-3.5 w-3.5 text-primary" />
                    ) : hasError ? (
                      <AlertTriangle className="h-3.5 w-3.5 text-destructive" />
                    ) : (
                      <X className="h-3.5 w-3.5 text-muted-foreground" />
                    )}
                  </div>

                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{repo.name}</p>
                    <p className="text-[10px] text-muted-foreground truncate">{repo.full_name}</p>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {isLoading ? (
                    <Badge variant="secondary" className="text-[10px] px-2 py-0 h-5 rounded-md">
                      Checking...
                    </Badge>
                  ) : isActive ? (
                    <Badge className="text-[10px] px-2 py-0 h-5 rounded-md bg-primary/15 text-primary border-0 gap-1">
                      <CircleDot className="w-2.5 h-2.5" /> Active
                    </Badge>
                  ) : hasError ? (
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger>
                          <Badge variant="destructive" className="text-[10px] px-2 py-0 h-5 rounded-md gap-1">
                            <AlertTriangle className="w-2.5 h-2.5" /> Error
                          </Badge>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p className="text-xs max-w-xs">{status?.error}</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  ) : (
                    <Badge variant="outline" className="text-[10px] px-2 py-0 h-5 rounded-md text-muted-foreground gap-1">
                      <X className="w-2.5 h-2.5" /> Inactive
                    </Badge>
                  )}

                  {status && !status.registered && !status.loading && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => registerWebhook(repo.full_name)}
                      className="h-7 px-2.5 text-xs rounded-lg text-primary hover:text-primary hover:bg-primary/10"
                    >
                      Register
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </ScrollArea>
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
    if (accessToken) checkStatus();
  }, [repoFullName, accessToken]);

  if (status.loading) {
    return <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />;
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger>
          {status.registered ? (
            <Webhook className="h-3 w-3 text-primary" />
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

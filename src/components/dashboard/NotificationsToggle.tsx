import { useEffect, useState } from "react";
import { Bell, BellOff, BellRing, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import {
  disablePushNotifications,
  enablePushNotifications,
  fetchPushConfig,
  inIframe,
  isPushEnabledHere,
  onForegroundPush,
  pushSupported,
} from "@/lib/push";

interface LivePush {
  title?: string;
  body?: string;
  progress?: number;
  repos: string[];
}

export function NotificationsToggle() {
  const [enabled, setEnabled] = useState(false);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [live, setLive] = useState<LivePush | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const cfg = await fetchPushConfig();
      if (!mounted) return;
      setConfigured(Boolean(cfg?.configured));
      setEnabled(await isPushEnabledHere());
    })();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!enabled) return;
    let unsub: (() => void) | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    (async () => {
      unsub = await onForegroundPush((payload) => {
        setLive(payload);
        if (payload.progress === 100 || payload.progress === undefined) {
          timer = setTimeout(() => setLive(null), 8000);
        }
      });
    })();
    return () => {
      unsub?.();
      if (timer) clearTimeout(timer);
    };
  }, [enabled]);

  const toggle = async () => {
    setBusy(true);
    try {
      if (enabled) {
        await disablePushNotifications();
        setEnabled(false);
        toast.success("Notifications turned off on this device");
      } else {
        const res = await enablePushNotifications();
        if (res.ok) {
          setEnabled(true);
          toast.success(res.message);
        } else {
          toast.error(res.message);
        }
      }
    } finally {
      setBusy(false);
    }
  };

  const Icon = busy ? Loader2 : live ? BellRing : enabled ? Bell : BellOff;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative rounded-full hover:bg-muted/50 transition-all w-9 h-9"
          title="Notifications"
        >
          <Icon className={`w-5 h-5 ${busy ? "animate-spin" : ""}`} />
          {enabled && (
            <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-primary" />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 rounded-xl">
        <div className="space-y-3">
          <div>
            <p className="text-sm font-semibold">Push notifications</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Get alerted when a repository receives a commit, with live sync progress.
            </p>
          </div>

          {configured === false && (
            <p className="text-xs text-destructive bg-destructive/5 rounded-lg px-2.5 py-2">
              Firebase keys are not configured yet, so notifications can't be enabled.
            </p>
          )}

          {!pushSupported() && (
            <p className="text-xs text-muted-foreground">
              This browser doesn't support push notifications.
            </p>
          )}

          {inIframe() && (
            <p className="text-xs text-muted-foreground bg-muted/40 rounded-lg px-2.5 py-2">
              You're in a preview frame. Open the app in its own browser tab first —
              browsers block the permission prompt inside embedded previews.
            </p>
          )}


          <Button
            onClick={toggle}
            disabled={busy || configured === false || !pushSupported()}
            variant={enabled ? "outline" : "default"}
            className="w-full rounded-lg h-9 text-sm"
          >
            {busy ? "Working…" : enabled ? "Turn off on this device" : "Enable notifications"}
          </Button>

          {live && (
            <div className="space-y-2 border-t border-border/40 pt-3">
              <p className="text-xs font-medium">{live.title ?? "Sync update"}</p>
              {live.body && (
                <p className="text-[11px] text-muted-foreground">{live.body}</p>
              )}
              {typeof live.progress === "number" && (
                <>
                  <Progress value={live.progress} className="h-1.5" />
                  <p className="text-[10px] text-muted-foreground text-right">
                    {live.progress}%
                  </p>
                </>
              )}
              {live.repos.length > 0 && (
                <ul className="space-y-0.5 max-h-32 overflow-auto">
                  {live.repos.map((r) => (
                    <li key={r} className="text-[10px] text-muted-foreground font-mono truncate">
                      • {r}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

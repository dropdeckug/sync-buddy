import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Shield,
  AlertTriangle,
  Eye,
  EyeOff,
  CheckCircle,
  XCircle,
  FileWarning,
  Loader2,
  Scan,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface DetectedSecret {
  id: string;
  sync_group_id: string;
  file_path: string;
  secret_type: string;
  line_number: number | null;
  detected_at: string;
  resolved_at: string | null;
  is_false_positive: boolean;
}

const secretTypeLabels: Record<string, { label: string; severity: 'high' | 'medium' | 'low' }> = {
  api_key: { label: "API Key", severity: "high" },
  aws_access_key: { label: "AWS Access Key", severity: "high" },
  aws_secret_key: { label: "AWS Secret Key", severity: "high" },
  github_token: { label: "GitHub Token", severity: "high" },
  private_key: { label: "Private Key", severity: "high" },
  database_url: { label: "Database URL", severity: "high" },
  password: { label: "Password", severity: "medium" },
  jwt_secret: { label: "JWT Secret", severity: "high" },
  slack_token: { label: "Slack Token", severity: "medium" },
  stripe_key: { label: "Stripe Key", severity: "high" },
  generic_secret: { label: "Generic Secret", severity: "low" },
};

const severityColors = {
  high: "bg-red-500/20 text-red-500",
  medium: "bg-yellow-500/20 text-yellow-500",
  low: "bg-blue-500/20 text-blue-500",
};

interface SecretDetectionProps {
  syncGroupId: string;
}

export function SecretDetection({ syncGroupId }: SecretDetectionProps) {
  const [secrets, setSecrets] = useState<DetectedSecret[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isScanning, setIsScanning] = useState(false);
  const [showResolved, setShowResolved] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    fetchSecrets();
  }, [syncGroupId]);

  const fetchSecrets = async () => {
    try {
      const { data, error } = await supabase
        .from("detected_secrets")
        .select("*")
        .eq("sync_group_id", syncGroupId)
        .order("detected_at", { ascending: false });

      if (error) throw error;
      setSecrets(data || []);
    } catch (error: any) {
      toast({
        title: "Error fetching secrets",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const scanForSecrets = async () => {
    setIsScanning(true);
    try {
      const { error } = await supabase.functions.invoke("scan-secrets", {
        body: { syncGroupId },
      });

      if (error) throw error;

      await fetchSecrets();

      toast({
        title: "Scan complete",
        description: "Secret scan has completed.",
      });
    } catch (error: any) {
      toast({
        title: "Scan failed",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsScanning(false);
    }
  };

  const markAsResolved = async (secretId: string) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { error } = await supabase
        .from("detected_secrets")
        .update({
          resolved_at: new Date().toISOString(),
          resolved_by: user.id,
        })
        .eq("id", secretId);

      if (error) throw error;

      setSecrets(prev =>
        prev.map(s => (s.id === secretId ? { ...s, resolved_at: new Date().toISOString() } : s))
      );

      toast({
        title: "Marked as resolved",
        description: "The secret has been marked as resolved.",
      });
    } catch (error: any) {
      toast({
        title: "Error updating secret",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const markAsFalsePositive = async (secretId: string) => {
    try {
      const { error } = await supabase
        .from("detected_secrets")
        .update({
          is_false_positive: true,
          resolved_at: new Date().toISOString(),
        })
        .eq("id", secretId);

      if (error) throw error;

      setSecrets(prev =>
        prev.map(s =>
          s.id === secretId
            ? { ...s, is_false_positive: true, resolved_at: new Date().toISOString() }
            : s
        )
      );

      toast({
        title: "Marked as false positive",
        description: "This detection will be ignored in future scans.",
      });
    } catch (error: any) {
      toast({
        title: "Error updating secret",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const activeSecrets = secrets.filter(s => !s.resolved_at);
  const resolvedSecrets = secrets.filter(s => s.resolved_at);
  const displayedSecrets = showResolved ? secrets : activeSecrets;

  const highSeverityCount = activeSecrets.filter(
    s => secretTypeLabels[s.secret_type]?.severity === "high"
  ).length;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Shield className="h-6 w-6" />
            Secret Detection
          </h2>
          <p className="text-muted-foreground">
            Scan for accidentally committed secrets and sensitive data
          </p>
        </div>
        <Button onClick={scanForSecrets} disabled={isScanning}>
          {isScanning ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Scan className="h-4 w-4 mr-2" />
          )}
          Scan Now
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Active Issues</p>
                <p className="text-3xl font-bold">{activeSecrets.length}</p>
              </div>
              {activeSecrets.length > 0 ? (
                <AlertTriangle className="h-8 w-8 text-yellow-500" />
              ) : (
                <CheckCircle className="h-8 w-8 text-green-500" />
              )}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">High Severity</p>
                <p className="text-3xl font-bold">{highSeverityCount}</p>
              </div>
              {highSeverityCount > 0 ? (
                <XCircle className="h-8 w-8 text-red-500" />
              ) : (
                <CheckCircle className="h-8 w-8 text-green-500" />
              )}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Resolved</p>
                <p className="text-3xl font-bold">{resolvedSecrets.length}</p>
              </div>
              <CheckCircle className="h-8 w-8 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4">
        <div className="flex items-center space-x-2">
          <Switch
            id="show-resolved"
            checked={showResolved}
            onCheckedChange={setShowResolved}
          />
          <Label htmlFor="show-resolved">Show resolved issues</Label>
        </div>
      </div>

      {/* Secret List */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileWarning className="h-5 w-5" />
            Detected Secrets
          </CardTitle>
          <CardDescription>
            {displayedSecrets.length} issue{displayedSecrets.length !== 1 ? "s" : ""} found
          </CardDescription>
        </CardHeader>
        <CardContent>
          {displayedSecrets.length === 0 ? (
            <div className="text-center py-12">
              <Shield className="h-12 w-12 text-green-500 mx-auto mb-4" />
              <h3 className="text-lg font-medium mb-2">No secrets detected</h3>
              <p className="text-muted-foreground">
                {showResolved
                  ? "No secrets have been detected in your repositories"
                  : "All detected secrets have been resolved"}
              </p>
            </div>
          ) : (
            <ScrollArea className="h-[400px]">
              <div className="space-y-3">
                {displayedSecrets.map((secret) => {
                  const typeInfo = secretTypeLabels[secret.secret_type] || {
                    label: secret.secret_type,
                    severity: "low" as const,
                  };

                  return (
                    <div
                      key={secret.id}
                      className={`flex items-center justify-between p-4 border rounded-lg ${
                        secret.resolved_at ? "opacity-60" : ""
                      }`}
                    >
                      <div className="flex items-center gap-4">
                        <div
                          className={`h-10 w-10 rounded-lg flex items-center justify-center ${
                            severityColors[typeInfo.severity]
                          }`}
                        >
                          {secret.is_false_positive ? (
                            <EyeOff className="h-5 w-5" />
                          ) : (
                            <AlertTriangle className="h-5 w-5" />
                          )}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="font-medium">{typeInfo.label}</p>
                            <Badge
                              variant="outline"
                              className={severityColors[typeInfo.severity]}
                            >
                              {typeInfo.severity}
                            </Badge>
                            {secret.is_false_positive && (
                              <Badge variant="secondary">False Positive</Badge>
                            )}
                            {secret.resolved_at && !secret.is_false_positive && (
                              <Badge variant="secondary">Resolved</Badge>
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground font-mono">
                            {secret.file_path}
                            {secret.line_number && `:${secret.line_number}`}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Detected {formatDistanceToNow(new Date(secret.detected_at), { addSuffix: true })}
                          </p>
                        </div>
                      </div>
                      {!secret.resolved_at && (
                        <div className="flex gap-2">
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="outline" size="sm">
                                <EyeOff className="h-4 w-4 mr-1" />
                                False Positive
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Mark as False Positive?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  This will mark the detection as a false positive and ignore it in future scans.
                                  Only do this if you're sure this is not a real secret.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction onClick={() => markAsFalsePositive(secret.id)}>
                                  Confirm
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                          <Button size="sm" onClick={() => markAsResolved(secret.id)}>
                            <CheckCircle className="h-4 w-4 mr-1" />
                            Resolve
                          </Button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

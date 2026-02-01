import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  History,
  Search,
  Download,
  RefreshCw,
  Loader2,
  GitBranch,
  Users,
  Settings,
  Bell,
  Shield,
  FileText,
} from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";

interface AuditLogEntry {
  id: string;
  user_id: string | null;
  user_email: string | null;
  action: string;
  resource_type: string;
  resource_id: string | null;
  resource_name: string | null;
  details: unknown;
  ip_address: string | null;
  user_agent: string | null;
  workspace_id: string | null;
  created_at: string;
}

const actionIcons: Record<string, any> = {
  sync: GitBranch,
  member: Users,
  settings: Settings,
  notification: Bell,
  security: Shield,
  default: FileText,
};

const actionColors: Record<string, string> = {
  create: "bg-green-500/20 text-green-500",
  update: "bg-blue-500/20 text-blue-500",
  delete: "bg-red-500/20 text-red-500",
  sync: "bg-purple-500/20 text-purple-500",
  approve: "bg-green-500/20 text-green-500",
  reject: "bg-red-500/20 text-red-500",
  login: "bg-yellow-500/20 text-yellow-500",
  default: "bg-gray-500/20 text-gray-500",
};

interface AuditLogProps {
  workspaceId?: string;
}

export function AuditLog({ workspaceId }: AuditLogProps) {
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [actionFilter, setActionFilter] = useState("all");
  const [resourceFilter, setResourceFilter] = useState("all");
  const { toast } = useToast();

  useEffect(() => {
    fetchLogs();
  }, [workspaceId]);

  const fetchLogs = async () => {
    setIsLoading(true);
    try {
      let query = supabase
        .from("audit_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200);

      if (workspaceId) {
        query = query.eq("workspace_id", workspaceId);
      }

      const { data, error } = await query;

      if (error) throw error;
      setLogs((data || []) as AuditLogEntry[]);
    } catch (error: any) {
      toast({
        title: "Error fetching audit logs",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const exportLogs = () => {
    const filteredLogs = getFilteredLogs();
    const csv = [
      ["Timestamp", "User", "Action", "Resource Type", "Resource Name", "Details"].join(","),
      ...filteredLogs.map((log) =>
        [
          format(new Date(log.created_at), "yyyy-MM-dd HH:mm:ss"),
          log.user_email || "System",
          log.action,
          log.resource_type,
          log.resource_name || "",
          JSON.stringify(log.details || {}),
        ].join(",")
      ),
    ].join("\n");

    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `audit-log-${format(new Date(), "yyyy-MM-dd")}.csv`;
    a.click();
    URL.revokeObjectURL(url);

    toast({
      title: "Export complete",
      description: `Exported ${filteredLogs.length} log entries`,
    });
  };

  const getFilteredLogs = () => {
    return logs.filter((log) => {
      const matchesSearch =
        !searchQuery ||
        log.action.toLowerCase().includes(searchQuery.toLowerCase()) ||
        log.resource_type.toLowerCase().includes(searchQuery.toLowerCase()) ||
        log.resource_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        log.user_email?.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesAction =
        actionFilter === "all" || log.action.includes(actionFilter);

      const matchesResource =
        resourceFilter === "all" || log.resource_type === resourceFilter;

      return matchesSearch && matchesAction && matchesResource;
    });
  };

  const getActionIcon = (action: string, resourceType: string) => {
    if (action.includes("sync")) return actionIcons.sync;
    if (resourceType === "workspace_member") return actionIcons.member;
    if (resourceType === "notification") return actionIcons.notification;
    if (action.includes("security") || action.includes("secret")) return actionIcons.security;
    return actionIcons[resourceType] || actionIcons.default;
  };

  const getActionColor = (action: string) => {
    if (action.includes("create") || action.includes("add")) return actionColors.create;
    if (action.includes("update") || action.includes("edit")) return actionColors.update;
    if (action.includes("delete") || action.includes("remove")) return actionColors.delete;
    if (action.includes("sync")) return actionColors.sync;
    if (action.includes("approve")) return actionColors.approve;
    if (action.includes("reject")) return actionColors.reject;
    if (action.includes("login")) return actionColors.login;
    return actionColors.default;
  };

  const filteredLogs = getFilteredLogs();
  const uniqueActions = [...new Set(logs.map((l) => l.action.split("_")[0]))];
  const uniqueResources = [...new Set(logs.map((l) => l.resource_type))];

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
          <h2 className="text-2xl font-bold">Audit Log</h2>
          <p className="text-muted-foreground">
            Complete history of all actions in your workspace
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={fetchLogs}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
          <Button variant="outline" onClick={exportLogs}>
            <Download className="h-4 w-4 mr-2" />
            Export CSV
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap gap-4">
            <div className="flex-1 min-w-[200px]">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search logs..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>
            <Select value={actionFilter} onValueChange={setActionFilter}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Action" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Actions</SelectItem>
                {uniqueActions.map((action) => (
                  <SelectItem key={action} value={action}>
                    {action.charAt(0).toUpperCase() + action.slice(1)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={resourceFilter} onValueChange={setResourceFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Resource" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Resources</SelectItem>
                {uniqueResources.map((resource) => (
                  <SelectItem key={resource} value={resource}>
                    {resource.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase())}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Log entries */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <History className="h-5 w-5" />
            Activity Timeline
          </CardTitle>
          <CardDescription>
            Showing {filteredLogs.length} of {logs.length} entries
          </CardDescription>
        </CardHeader>
        <CardContent>
          {filteredLogs.length === 0 ? (
            <div className="text-center py-12">
              <History className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-medium mb-2">No activity found</h3>
              <p className="text-muted-foreground">
                {searchQuery || actionFilter !== "all" || resourceFilter !== "all"
                  ? "Try adjusting your filters"
                  : "Activity will appear here as you use the platform"}
              </p>
            </div>
          ) : (
            <ScrollArea className="h-[500px] pr-4">
              <div className="relative pl-6 border-l border-border">
                {filteredLogs.map((log, index) => {
                  const Icon = getActionIcon(log.action, log.resource_type);
                  const colorClass = getActionColor(log.action);

                  return (
                    <div
                      key={log.id}
                      className="relative pb-6 last:pb-0"
                    >
                      {/* Timeline dot */}
                      <div
                        className={`absolute -left-[13px] w-6 h-6 rounded-full flex items-center justify-center ${colorClass}`}
                      >
                        <Icon className="h-3 w-3" />
                      </div>

                      {/* Content */}
                      <div className="ml-4">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge className={colorClass}>
                            {log.action.replace(/_/g, " ")}
                          </Badge>
                          <span className="text-sm text-muted-foreground">
                            {formatDistanceToNow(new Date(log.created_at), { addSuffix: true })}
                          </span>
                        </div>
                        <p className="text-sm mt-1">
                          <span className="font-medium">
                            {log.user_email || "System"}
                          </span>
                          {" "}
                          performed{" "}
                          <span className="font-medium">{log.action.replace(/_/g, " ")}</span>
                          {log.resource_name && (
                            <>
                              {" "}on{" "}
                              <span className="font-medium">{log.resource_name}</span>
                            </>
                          )}
                        </p>
                        {log.details && Object.keys(log.details).length > 0 && (
                          <div className="mt-2 p-2 bg-muted rounded text-xs font-mono">
                            {JSON.stringify(log.details, null, 2)}
                          </div>
                        )}
                      </div>
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

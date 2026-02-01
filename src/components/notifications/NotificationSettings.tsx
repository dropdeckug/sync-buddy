import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Bell, Mail, MessageSquare, Webhook, Plus, Trash2, Loader2, CheckCircle, XCircle, Settings } from "lucide-react";

type ChannelType = 'email' | 'slack' | 'discord' | 'teams' | 'webhook';

interface NotificationChannel {
  id: string;
  channel_type: ChannelType;
  name: string;
  config: Record<string, any>;
  is_enabled: boolean;
  created_at: string;
}

interface NotificationRule {
  id: string;
  channel_id: string;
  event_type: string;
  is_enabled: boolean;
}

const channelIcons = {
  email: Mail,
  slack: MessageSquare,
  discord: MessageSquare,
  teams: MessageSquare,
  webhook: Webhook,
};

const eventTypes = [
  { value: 'sync_started', label: 'Sync Started' },
  { value: 'sync_completed', label: 'Sync Completed' },
  { value: 'sync_failed', label: 'Sync Failed' },
  { value: 'approval_required', label: 'Approval Required' },
  { value: 'approval_granted', label: 'Approval Granted' },
  { value: 'approval_denied', label: 'Approval Denied' },
  { value: 'member_joined', label: 'Member Joined' },
  { value: 'secret_detected', label: 'Secret Detected' },
];

export function NotificationSettings() {
  const [channels, setChannels] = useState<NotificationChannel[]>([]);
  const [rules, setRules] = useState<Record<string, NotificationRule[]>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [selectedChannel, setSelectedChannel] = useState<NotificationChannel | null>(null);
  const [newChannel, setNewChannel] = useState({
    type: 'email' as ChannelType,
    name: '',
    config: {} as Record<string, string>,
  });
  const { toast } = useToast();

  useEffect(() => {
    fetchChannels();
  }, []);

  const fetchChannels = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from("notification_channels")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setChannels((data || []) as NotificationChannel[]);

      // Fetch rules for each channel
      if (data) {
        for (const channel of data) {
          fetchRulesForChannel(channel.id);
        }
      }
    } catch (error: any) {
      toast({
        title: "Error fetching notification channels",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const fetchRulesForChannel = async (channelId: string) => {
    try {
      const { data, error } = await supabase
        .from("notification_rules")
        .select("*")
        .eq("channel_id", channelId);

      if (error) throw error;
      setRules(prev => ({ ...prev, [channelId]: data || [] }));
    } catch (error) {
      console.error("Error fetching rules:", error);
    }
  };

  const createChannel = async () => {
    if (!newChannel.name.trim()) return;

    setIsCreating(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data, error } = await supabase
        .from("notification_channels")
        .insert({
          user_id: user.id,
          channel_type: newChannel.type,
          name: newChannel.name,
          config: newChannel.config,
        })
        .select()
        .single();

      if (error) throw error;

      // Create default rules for all events
      const defaultRules = eventTypes.map(event => ({
        channel_id: data.id,
        event_type: event.value,
        is_enabled: ['sync_completed', 'sync_failed'].includes(event.value),
      }));

      await supabase.from("notification_rules").insert(defaultRules);

      setChannels(prev => [data as NotificationChannel, ...prev]);
      fetchRulesForChannel(data.id);
      setShowCreateDialog(false);
      setNewChannel({ type: 'email' as ChannelType, name: '', config: {} });

      toast({
        title: "Channel created",
        description: `${newChannel.name} has been set up for notifications.`,
      });
    } catch (error: any) {
      toast({
        title: "Error creating channel",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsCreating(false);
    }
  };

  const toggleChannel = async (channel: NotificationChannel) => {
    try {
      const { error } = await supabase
        .from("notification_channels")
        .update({ is_enabled: !channel.is_enabled })
        .eq("id", channel.id);

      if (error) throw error;

      setChannels(prev =>
        prev.map(c => (c.id === channel.id ? { ...c, is_enabled: !c.is_enabled } : c))
      );
    } catch (error: any) {
      toast({
        title: "Error updating channel",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const toggleRule = async (channelId: string, rule: NotificationRule) => {
    try {
      const { error } = await supabase
        .from("notification_rules")
        .update({ is_enabled: !rule.is_enabled })
        .eq("id", rule.id);

      if (error) throw error;

      setRules(prev => ({
        ...prev,
        [channelId]: prev[channelId].map(r =>
          r.id === rule.id ? { ...r, is_enabled: !r.is_enabled } : r
        ),
      }));
    } catch (error: any) {
      toast({
        title: "Error updating rule",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const deleteChannel = async (channelId: string) => {
    try {
      const { error } = await supabase
        .from("notification_channels")
        .delete()
        .eq("id", channelId);

      if (error) throw error;

      setChannels(prev => prev.filter(c => c.id !== channelId));
      setSelectedChannel(null);

      toast({
        title: "Channel deleted",
        description: "The notification channel has been removed.",
      });
    } catch (error: any) {
      toast({
        title: "Error deleting channel",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const testChannel = async (channel: NotificationChannel) => {
    try {
      const { error } = await supabase.functions.invoke("send-notification", {
        body: {
          channelId: channel.id,
          eventType: "test",
          payload: {
            title: "Test Notification",
            message: "This is a test notification from your sync tool.",
          },
        },
      });

      if (error) throw error;

      toast({
        title: "Test sent",
        description: "A test notification has been sent to this channel.",
      });
    } catch (error: any) {
      toast({
        title: "Test failed",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const renderConfigFields = () => {
    switch (newChannel.type) {
      case 'email':
        return (
          <div className="space-y-2">
            <Label>Email Address</Label>
            <Input
              type="email"
              placeholder="notifications@company.com"
              value={newChannel.config.email || ''}
              onChange={(e) => setNewChannel(prev => ({
                ...prev,
                config: { ...prev.config, email: e.target.value },
              }))}
            />
          </div>
        );
      case 'slack':
        return (
          <div className="space-y-2">
            <Label>Slack Webhook URL</Label>
            <Input
              type="url"
              placeholder="https://hooks.slack.com/services/..."
              value={newChannel.config.webhookUrl || ''}
              onChange={(e) => setNewChannel(prev => ({
                ...prev,
                config: { ...prev.config, webhookUrl: e.target.value },
              }))}
            />
            <p className="text-xs text-muted-foreground">
              Create an incoming webhook in your Slack workspace settings.
            </p>
          </div>
        );
      case 'discord':
        return (
          <div className="space-y-2">
            <Label>Discord Webhook URL</Label>
            <Input
              type="url"
              placeholder="https://discord.com/api/webhooks/..."
              value={newChannel.config.webhookUrl || ''}
              onChange={(e) => setNewChannel(prev => ({
                ...prev,
                config: { ...prev.config, webhookUrl: e.target.value },
              }))}
            />
          </div>
        );
      case 'webhook':
        return (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Webhook URL</Label>
              <Input
                type="url"
                placeholder="https://your-server.com/webhook"
                value={newChannel.config.url || ''}
                onChange={(e) => setNewChannel(prev => ({
                  ...prev,
                  config: { ...prev.config, url: e.target.value },
                }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Secret (optional)</Label>
              <Input
                type="password"
                placeholder="Webhook secret for signature verification"
                value={newChannel.config.secret || ''}
                onChange={(e) => setNewChannel(prev => ({
                  ...prev,
                  config: { ...prev.config, secret: e.target.value },
                }))}
              />
            </div>
          </div>
        );
      default:
        return null;
    }
  };

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
          <h2 className="text-2xl font-bold">Notification Settings</h2>
          <p className="text-muted-foreground">
            Configure how you receive notifications about sync events
          </p>
        </div>
        <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Add Channel
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Notification Channel</DialogTitle>
              <DialogDescription>
                Set up a new channel to receive notifications
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Channel Type</Label>
                <Select
                  value={newChannel.type}
                  onValueChange={(value: string) => setNewChannel(prev => ({
                    ...prev,
                    type: value as ChannelType,
                    config: {},
                  }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="email">
                      <div className="flex items-center gap-2">
                        <Mail className="h-4 w-4" />
                        Email
                      </div>
                    </SelectItem>
                    <SelectItem value="slack">
                      <div className="flex items-center gap-2">
                        <MessageSquare className="h-4 w-4" />
                        Slack
                      </div>
                    </SelectItem>
                    <SelectItem value="discord">
                      <div className="flex items-center gap-2">
                        <MessageSquare className="h-4 w-4" />
                        Discord
                      </div>
                    </SelectItem>
                    <SelectItem value="webhook">
                      <div className="flex items-center gap-2">
                        <Webhook className="h-4 w-4" />
                        Custom Webhook
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Channel Name</Label>
                <Input
                  placeholder="e.g., Team Slack Channel"
                  value={newChannel.name}
                  onChange={(e) => setNewChannel(prev => ({ ...prev, name: e.target.value }))}
                />
              </div>
              {renderConfigFields()}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
                Cancel
              </Button>
              <Button onClick={createChannel} disabled={isCreating || !newChannel.name.trim()}>
                {isCreating && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Add Channel
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {channels.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Bell className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">No notification channels</h3>
            <p className="text-muted-foreground text-center mb-4">
              Add a channel to receive notifications about your sync events.
            </p>
            <Button onClick={() => setShowCreateDialog(true)}>
              Add Channel
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {channels.map((channel) => {
            const Icon = channelIcons[channel.channel_type];
            const channelRules = rules[channel.id] || [];

            return (
              <Card key={channel.id}>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${
                        channel.is_enabled ? 'bg-primary/20' : 'bg-muted'
                      }`}>
                        <Icon className={`h-5 w-5 ${channel.is_enabled ? 'text-primary' : 'text-muted-foreground'}`} />
                      </div>
                      <div>
                        <CardTitle className="text-lg">{channel.name}</CardTitle>
                        <CardDescription className="capitalize">
                          {channel.channel_type}
                          {!channel.is_enabled && " (Disabled)"}
                        </CardDescription>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={channel.is_enabled}
                        onCheckedChange={() => toggleChannel(channel)}
                      />
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => testChannel(channel)}
                      >
                        Test
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setSelectedChannel(
                          selectedChannel?.id === channel.id ? null : channel
                        )}
                      >
                        <Settings className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => deleteChannel(channel.id)}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                {selectedChannel?.id === channel.id && (
                  <CardContent className="border-t pt-4">
                    <h4 className="font-medium mb-3">Event Notifications</h4>
                    <div className="grid gap-2">
                      {eventTypes.map((event) => {
                        const rule = channelRules.find(r => r.event_type === event.value);
                        return (
                          <div
                            key={event.value}
                            className="flex items-center justify-between p-2 rounded-lg hover:bg-muted/50"
                          >
                            <span className="text-sm">{event.label}</span>
                            {rule ? (
                              <Switch
                                checked={rule.is_enabled}
                                onCheckedChange={() => toggleRule(channel.id, rule)}
                              />
                            ) : (
                              <Badge variant="secondary" className="text-xs">
                                Not configured
                              </Badge>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

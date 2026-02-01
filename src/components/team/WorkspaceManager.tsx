import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Users, UserPlus, Settings, Crown, Shield, Eye, Zap, Mail, Trash2, Loader2 } from "lucide-react";

interface Workspace {
  id: string;
  name: string;
  description: string | null;
  owner_id: string;
  created_at: string;
}

interface WorkspaceMember {
  id: string;
  user_id: string;
  role: 'owner' | 'admin' | 'syncer' | 'viewer';
  joined_at: string;
  user_email?: string;
}

interface WorkspaceInvitation {
  id: string;
  email: string;
  role: 'owner' | 'admin' | 'syncer' | 'viewer';
  expires_at: string;
  created_at: string;
}

const roleIcons = {
  owner: Crown,
  admin: Shield,
  syncer: Zap,
  viewer: Eye,
};

const roleColors = {
  owner: "bg-yellow-500/20 text-yellow-500",
  admin: "bg-purple-500/20 text-purple-500",
  syncer: "bg-blue-500/20 text-blue-500",
  viewer: "bg-gray-500/20 text-gray-500",
};

export function WorkspaceManager() {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [selectedWorkspace, setSelectedWorkspace] = useState<Workspace | null>(null);
  const [members, setMembers] = useState<WorkspaceMember[]>([]);
  const [invitations, setInvitations] = useState<WorkspaceInvitation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [isInviting, setIsInviting] = useState(false);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showInviteDialog, setShowInviteDialog] = useState(false);
  const [newWorkspace, setNewWorkspace] = useState({ name: "", description: "" });
  const [newInvite, setNewInvite] = useState({ email: "", role: "viewer" as const });
  const { toast } = useToast();

  useEffect(() => {
    fetchWorkspaces();
  }, []);

  useEffect(() => {
    if (selectedWorkspace) {
      fetchMembers(selectedWorkspace.id);
      fetchInvitations(selectedWorkspace.id);
    }
  }, [selectedWorkspace]);

  const fetchWorkspaces = async () => {
    try {
      const { data, error } = await supabase
        .from("workspaces")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      setWorkspaces(data || []);
      if (data && data.length > 0 && !selectedWorkspace) {
        setSelectedWorkspace(data[0]);
      }
    } catch (error: any) {
      toast({
        title: "Error fetching workspaces",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const fetchMembers = async (workspaceId: string) => {
    try {
      const { data, error } = await supabase
        .from("workspace_members")
        .select("*")
        .eq("workspace_id", workspaceId);

      if (error) throw error;
      setMembers(data || []);
    } catch (error: any) {
      console.error("Error fetching members:", error);
    }
  };

  const fetchInvitations = async (workspaceId: string) => {
    try {
      const { data, error } = await supabase
        .from("workspace_invitations")
        .select("*")
        .eq("workspace_id", workspaceId)
        .is("accepted_at", null);

      if (error) throw error;
      setInvitations(data || []);
    } catch (error: any) {
      console.error("Error fetching invitations:", error);
    }
  };

  const createWorkspace = async () => {
    if (!newWorkspace.name.trim()) return;

    setIsCreating(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data, error } = await supabase
        .from("workspaces")
        .insert({
          name: newWorkspace.name,
          description: newWorkspace.description || null,
          owner_id: user.id,
        })
        .select()
        .single();

      if (error) throw error;

      setWorkspaces(prev => [data, ...prev]);
      setSelectedWorkspace(data);
      setShowCreateDialog(false);
      setNewWorkspace({ name: "", description: "" });

      toast({
        title: "Workspace created",
        description: `"${data.name}" has been created successfully.`,
      });
    } catch (error: any) {
      toast({
        title: "Error creating workspace",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsCreating(false);
    }
  };

  const sendInvitation = async () => {
    if (!selectedWorkspace || !newInvite.email.trim()) return;

    setIsInviting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data, error } = await supabase
        .from("workspace_invitations")
        .insert({
          workspace_id: selectedWorkspace.id,
          email: newInvite.email,
          role: newInvite.role,
          invited_by: user.id,
        })
        .select()
        .single();

      if (error) throw error;

      setInvitations(prev => [data, ...prev]);
      setShowInviteDialog(false);
      setNewInvite({ email: "", role: "viewer" });

      toast({
        title: "Invitation sent",
        description: `Invitation sent to ${newInvite.email}`,
      });
    } catch (error: any) {
      toast({
        title: "Error sending invitation",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsInviting(false);
    }
  };

  const updateMemberRole = async (memberId: string, newRole: 'admin' | 'syncer' | 'viewer') => {
    try {
      const { error } = await supabase
        .from("workspace_members")
        .update({ role: newRole })
        .eq("id", memberId);

      if (error) throw error;

      setMembers(prev =>
        prev.map(m => (m.id === memberId ? { ...m, role: newRole } : m))
      );

      toast({
        title: "Role updated",
        description: "Member role has been updated.",
      });
    } catch (error: any) {
      toast({
        title: "Error updating role",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const removeMember = async (memberId: string) => {
    try {
      const { error } = await supabase
        .from("workspace_members")
        .delete()
        .eq("id", memberId);

      if (error) throw error;

      setMembers(prev => prev.filter(m => m.id !== memberId));

      toast({
        title: "Member removed",
        description: "Member has been removed from the workspace.",
      });
    } catch (error: any) {
      toast({
        title: "Error removing member",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const cancelInvitation = async (invitationId: string) => {
    try {
      const { error } = await supabase
        .from("workspace_invitations")
        .delete()
        .eq("id", invitationId);

      if (error) throw error;

      setInvitations(prev => prev.filter(i => i.id !== invitationId));

      toast({
        title: "Invitation cancelled",
        description: "The invitation has been cancelled.",
      });
    } catch (error: any) {
      toast({
        title: "Error cancelling invitation",
        description: error.message,
        variant: "destructive",
      });
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
          <h2 className="text-2xl font-bold">Team Workspaces</h2>
          <p className="text-muted-foreground">
            Manage your team workspaces and members
          </p>
        </div>
        <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
          <DialogTrigger asChild>
            <Button>
              <Users className="h-4 w-4 mr-2" />
              Create Workspace
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create New Workspace</DialogTitle>
              <DialogDescription>
                Create a workspace to collaborate with your team on sync projects.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="workspace-name">Workspace Name</Label>
                <Input
                  id="workspace-name"
                  placeholder="e.g., Engineering Team"
                  value={newWorkspace.name}
                  onChange={(e) => setNewWorkspace(prev => ({ ...prev, name: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="workspace-desc">Description (optional)</Label>
                <Input
                  id="workspace-desc"
                  placeholder="Brief description of this workspace"
                  value={newWorkspace.description}
                  onChange={(e) => setNewWorkspace(prev => ({ ...prev, description: e.target.value }))}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
                Cancel
              </Button>
              <Button onClick={createWorkspace} disabled={isCreating || !newWorkspace.name.trim()}>
                {isCreating && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Create Workspace
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {workspaces.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Users className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">No workspaces yet</h3>
            <p className="text-muted-foreground text-center mb-4">
              Create your first workspace to start collaborating with your team.
            </p>
            <Button onClick={() => setShowCreateDialog(true)}>
              Create Workspace
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Workspace List */}
          <div className="space-y-4">
            <h3 className="font-medium text-sm text-muted-foreground uppercase tracking-wider">
              Your Workspaces
            </h3>
            {workspaces.map((workspace) => (
              <Card
                key={workspace.id}
                className={`cursor-pointer transition-colors ${
                  selectedWorkspace?.id === workspace.id
                    ? "border-primary bg-primary/5"
                    : "hover:bg-muted/50"
                }`}
                onClick={() => setSelectedWorkspace(workspace)}
              >
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-lg bg-primary/20 flex items-center justify-center">
                      <Users className="h-5 w-5 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="font-medium truncate">{workspace.name}</h4>
                      {workspace.description && (
                        <p className="text-xs text-muted-foreground truncate">
                          {workspace.description}
                        </p>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Workspace Details */}
          {selectedWorkspace && (
            <div className="lg:col-span-2">
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle>{selectedWorkspace.name}</CardTitle>
                      <CardDescription>
                        {selectedWorkspace.description || "No description"}
                      </CardDescription>
                    </div>
                    <Dialog open={showInviteDialog} onOpenChange={setShowInviteDialog}>
                      <DialogTrigger asChild>
                        <Button>
                          <UserPlus className="h-4 w-4 mr-2" />
                          Invite Member
                        </Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>Invite Team Member</DialogTitle>
                          <DialogDescription>
                            Send an invitation to join "{selectedWorkspace.name}"
                          </DialogDescription>
                        </DialogHeader>
                        <div className="space-y-4 py-4">
                          <div className="space-y-2">
                            <Label htmlFor="invite-email">Email Address</Label>
                            <Input
                              id="invite-email"
                              type="email"
                              placeholder="colleague@company.com"
                              value={newInvite.email}
                              onChange={(e) => setNewInvite(prev => ({ ...prev, email: e.target.value }))}
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="invite-role">Role</Label>
                            <Select
                              value={newInvite.role}
                              onValueChange={(value: any) => setNewInvite(prev => ({ ...prev, role: value }))}
                            >
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="admin">
                                  <div className="flex items-center gap-2">
                                    <Shield className="h-4 w-4 text-purple-500" />
                                    Admin - Full access
                                  </div>
                                </SelectItem>
                                <SelectItem value="syncer">
                                  <div className="flex items-center gap-2">
                                    <Zap className="h-4 w-4 text-blue-500" />
                                    Syncer - Can run syncs
                                  </div>
                                </SelectItem>
                                <SelectItem value="viewer">
                                  <div className="flex items-center gap-2">
                                    <Eye className="h-4 w-4 text-gray-500" />
                                    Viewer - Read only
                                  </div>
                                </SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                        <DialogFooter>
                          <Button variant="outline" onClick={() => setShowInviteDialog(false)}>
                            Cancel
                          </Button>
                          <Button onClick={sendInvitation} disabled={isInviting || !newInvite.email.trim()}>
                            {isInviting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                            Send Invitation
                          </Button>
                        </DialogFooter>
                      </DialogContent>
                    </Dialog>
                  </div>
                </CardHeader>
                <CardContent>
                  <Tabs defaultValue="members">
                    <TabsList>
                      <TabsTrigger value="members">Members</TabsTrigger>
                      <TabsTrigger value="pending">
                        Pending Invites
                        {invitations.length > 0 && (
                          <Badge variant="secondary" className="ml-2">
                            {invitations.length}
                          </Badge>
                        )}
                      </TabsTrigger>
                    </TabsList>

                    <TabsContent value="members" className="space-y-4 mt-4">
                      {members.length === 0 ? (
                        <p className="text-muted-foreground text-center py-8">
                          No members yet. Invite your first team member!
                        </p>
                      ) : (
                        members.map((member) => {
                          const RoleIcon = roleIcons[member.role];
                          return (
                            <div
                              key={member.id}
                              className="flex items-center justify-between p-3 border rounded-lg"
                            >
                              <div className="flex items-center gap-3">
                                <Avatar>
                                  <AvatarFallback>
                                    {member.user_email?.[0]?.toUpperCase() || "U"}
                                  </AvatarFallback>
                                </Avatar>
                                <div>
                                  <p className="font-medium">
                                    {member.user_email || "Unknown User"}
                                  </p>
                                  <Badge className={roleColors[member.role]}>
                                    <RoleIcon className="h-3 w-3 mr-1" />
                                    {member.role}
                                  </Badge>
                                </div>
                              </div>
                              {member.role !== "owner" && (
                                <div className="flex items-center gap-2">
                                  <Select
                                    value={member.role}
                                    onValueChange={(value: 'admin' | 'syncer' | 'viewer') => updateMemberRole(member.id, value)}
                                  >
                                    <SelectTrigger className="w-32">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="admin">Admin</SelectItem>
                                      <SelectItem value="syncer">Syncer</SelectItem>
                                      <SelectItem value="viewer">Viewer</SelectItem>
                                    </SelectContent>
                                  </Select>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => removeMember(member.id)}
                                  >
                                    <Trash2 className="h-4 w-4 text-destructive" />
                                  </Button>
                                </div>
                              )}
                            </div>
                          );
                        })
                      )}
                    </TabsContent>

                    <TabsContent value="pending" className="space-y-4 mt-4">
                      {invitations.length === 0 ? (
                        <p className="text-muted-foreground text-center py-8">
                          No pending invitations
                        </p>
                      ) : (
                        invitations.map((invitation) => (
                          <div
                            key={invitation.id}
                            className="flex items-center justify-between p-3 border rounded-lg"
                          >
                            <div className="flex items-center gap-3">
                              <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center">
                                <Mail className="h-5 w-5 text-muted-foreground" />
                              </div>
                              <div>
                                <p className="font-medium">{invitation.email}</p>
                                <p className="text-xs text-muted-foreground">
                                  Expires {new Date(invitation.expires_at).toLocaleDateString()}
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <Badge variant="outline">{invitation.role}</Badge>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => cancelInvitation(invitation.id)}
                              >
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            </div>
                          </div>
                        ))
                      )}
                    </TabsContent>
                  </Tabs>
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

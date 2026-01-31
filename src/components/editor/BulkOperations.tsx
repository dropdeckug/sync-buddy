import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { 
  FileEdit, 
  Replace, 
  Trash2, 
  Loader2, 
  AlertTriangle, 
  CheckCircle2, 
  XCircle,
  FolderSync,
  Search
} from "lucide-react";

interface BulkOperationsProps {
  isOpen: boolean;
  onClose: () => void;
  accountId: string;
  repos: { id: string; name: string; fullName: string }[];
}

interface OperationResult {
  repo: string;
  success: boolean;
  message: string;
  filesAffected?: number;
}

export function BulkOperations({ isOpen, onClose, accountId, repos }: BulkOperationsProps) {
  const [selectedRepos, setSelectedRepos] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState("rename");
  const queryClient = useQueryClient();

  // Rename state
  const [oldPath, setOldPath] = useState("");
  const [newPath, setNewPath] = useState("");

  // Find & Replace state
  const [findPattern, setFindPattern] = useState("");
  const [replaceWith, setReplaceWith] = useState("");
  const [filePattern, setFilePattern] = useState("*");

  // Delete state
  const [deletePaths, setDeletePaths] = useState("");

  // Results
  const [results, setResults] = useState<OperationResult[]>([]);

  const toggleRepo = (fullName: string) => {
    setSelectedRepos(prev => 
      prev.includes(fullName) 
        ? prev.filter(r => r !== fullName)
        : [...prev, fullName]
    );
  };

  const selectAll = () => {
    if (selectedRepos.length === repos.length) {
      setSelectedRepos([]);
    } else {
      setSelectedRepos(repos.map(r => r.fullName));
    }
  };

  const bulkMutation = useMutation({
    mutationFn: async (operation: { type: string; params: Record<string, any> }) => {
      const { data, error } = await supabase.functions.invoke('github-bulk-operations', {
        body: {
          accountId,
          operation: {
            type: operation.type,
            repos: selectedRepos,
            params: operation.params,
          },
        },
      });

      if (error) throw error;
      if (data.error) throw new Error(data.error);
      return data;
    },
    onSuccess: (data) => {
      setResults(data.results);
      const successCount = data.results.filter((r: OperationResult) => r.success).length;
      toast.success(`Operation completed`, {
        description: `${successCount}/${data.results.length} repositories processed successfully`,
      });
      queryClient.invalidateQueries({ queryKey: ['sync-history'] });
    },
    onError: (error) => {
      toast.error('Operation failed', {
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    },
  });

  const handleRename = () => {
    if (!oldPath || !newPath) {
      toast.error('Please provide both old and new file paths');
      return;
    }
    if (selectedRepos.length === 0) {
      toast.error('Please select at least one repository');
      return;
    }
    bulkMutation.mutate({
      type: 'rename',
      params: { oldPath, newPath },
    });
  };

  const handleFindReplace = () => {
    if (!findPattern) {
      toast.error('Please provide a search pattern');
      return;
    }
    if (selectedRepos.length === 0) {
      toast.error('Please select at least one repository');
      return;
    }
    bulkMutation.mutate({
      type: 'find-replace',
      params: { findPattern, replaceWith, filePattern },
    });
  };

  const handleDelete = () => {
    const paths = deletePaths.split('\n').filter(p => p.trim());
    if (paths.length === 0) {
      toast.error('Please provide file paths to delete');
      return;
    }
    if (selectedRepos.length === 0) {
      toast.error('Please select at least one repository');
      return;
    }
    bulkMutation.mutate({
      type: 'delete',
      params: { paths },
    });
  };

  const clearResults = () => setResults([]);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl h-[85vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-6 py-4 border-b border-border shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <FolderSync className="h-5 w-5 text-primary" />
            </div>
            <div>
              <DialogTitle>Bulk Operations</DialogTitle>
              <DialogDescription>Perform operations across multiple repositories at once</DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 flex overflow-hidden min-h-0">
          {/* Repository Selection */}
          <div className="w-64 border-r border-border p-4 flex flex-col shrink-0">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-medium text-sm">Repositories</h3>
              <Button variant="ghost" size="sm" onClick={selectAll}>
                {selectedRepos.length === repos.length ? 'Deselect All' : 'Select All'}
              </Button>
            </div>
            <ScrollArea className="flex-1">
              <div className="space-y-2">
                {repos.map((repo) => (
                  <label
                    key={repo.id}
                    className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted cursor-pointer transition-colors"
                  >
                    <Checkbox
                      checked={selectedRepos.includes(repo.fullName)}
                      onCheckedChange={() => toggleRepo(repo.fullName)}
                    />
                    <span className="text-sm truncate">{repo.name}</span>
                  </label>
                ))}
              </div>
            </ScrollArea>
            <div className="pt-3 border-t border-border mt-3">
              <Badge variant="secondary" className="w-full justify-center">
                {selectedRepos.length} selected
              </Badge>
            </div>
          </div>

          {/* Operation Tabs */}
          <div className="flex-1 flex flex-col overflow-hidden">
            <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col">
              <div className="px-4 pt-4 shrink-0">
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="rename" className="gap-2">
                    <FileEdit className="h-4 w-4" />
                    Rename
                  </TabsTrigger>
                  <TabsTrigger value="find-replace" className="gap-2">
                    <Replace className="h-4 w-4" />
                    Find & Replace
                  </TabsTrigger>
                  <TabsTrigger value="delete" className="gap-2">
                    <Trash2 className="h-4 w-4" />
                    Delete
                  </TabsTrigger>
                </TabsList>
              </div>

              <ScrollArea className="flex-1">
                <div className="p-4">
                  <TabsContent value="rename" className="mt-0 space-y-4">
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-base">Rename Files</CardTitle>
                        <CardDescription>
                          Rename a file in all selected repositories. The file must exist at the old path.
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="space-y-2">
                          <Label>Current File Path</Label>
                          <Input
                            placeholder="e.g., src/utils/helpers.js"
                            value={oldPath}
                            onChange={(e) => setOldPath(e.target.value)}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>New File Path</Label>
                          <Input
                            placeholder="e.g., src/utils/helpers.ts"
                            value={newPath}
                            onChange={(e) => setNewPath(e.target.value)}
                          />
                        </div>
                        <Button 
                          onClick={handleRename} 
                          disabled={bulkMutation.isPending || selectedRepos.length === 0}
                          className="w-full"
                        >
                          {bulkMutation.isPending ? (
                            <>
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                              Processing...
                            </>
                          ) : (
                            <>
                              <FileEdit className="h-4 w-4 mr-2" />
                              Rename in {selectedRepos.length} Repositories
                            </>
                          )}
                        </Button>
                      </CardContent>
                    </Card>
                  </TabsContent>

                  <TabsContent value="find-replace" className="mt-0 space-y-4">
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-base">Find & Replace</CardTitle>
                        <CardDescription>
                          Search for text across all files and replace it. Use file patterns to limit scope.
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="space-y-2">
                          <Label>Find Pattern</Label>
                          <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input
                              placeholder="Text to find..."
                              value={findPattern}
                              onChange={(e) => setFindPattern(e.target.value)}
                              className="pl-10"
                            />
                          </div>
                        </div>
                        <div className="space-y-2">
                          <Label>Replace With</Label>
                          <Input
                            placeholder="Replacement text (leave empty to delete)"
                            value={replaceWith}
                            onChange={(e) => setReplaceWith(e.target.value)}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>File Pattern</Label>
                          <Input
                            placeholder="e.g., *.ts, *.js, package.json"
                            value={filePattern}
                            onChange={(e) => setFilePattern(e.target.value)}
                          />
                          <p className="text-xs text-muted-foreground">
                            Use * as wildcard. Leave as * to search all files.
                          </p>
                        </div>
                        <Button 
                          onClick={handleFindReplace} 
                          disabled={bulkMutation.isPending || selectedRepos.length === 0}
                          className="w-full"
                        >
                          {bulkMutation.isPending ? (
                            <>
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                              Processing...
                            </>
                          ) : (
                            <>
                              <Replace className="h-4 w-4 mr-2" />
                              Replace in {selectedRepos.length} Repositories
                            </>
                          )}
                        </Button>
                      </CardContent>
                    </Card>
                  </TabsContent>

                  <TabsContent value="delete" className="mt-0 space-y-4">
                    <Card className="border-destructive/50">
                      <CardHeader>
                        <div className="flex items-center gap-2">
                          <AlertTriangle className="h-5 w-5 text-destructive" />
                          <CardTitle className="text-base">Delete Files</CardTitle>
                        </div>
                        <CardDescription>
                          Permanently delete files from all selected repositories. This action cannot be undone.
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="space-y-2">
                          <Label>File Paths (one per line)</Label>
                          <textarea
                            className="w-full min-h-[120px] p-3 rounded-lg border border-input bg-background text-sm font-mono resize-none"
                            placeholder={`e.g.,\n.env.example\nold-config.json\nsrc/deprecated/`}
                            value={deletePaths}
                            onChange={(e) => setDeletePaths(e.target.value)}
                          />
                        </div>
                        <Button 
                          variant="destructive"
                          onClick={handleDelete} 
                          disabled={bulkMutation.isPending || selectedRepos.length === 0}
                          className="w-full"
                        >
                          {bulkMutation.isPending ? (
                            <>
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                              Deleting...
                            </>
                          ) : (
                            <>
                              <Trash2 className="h-4 w-4 mr-2" />
                              Delete from {selectedRepos.length} Repositories
                            </>
                          )}
                        </Button>
                      </CardContent>
                    </Card>
                  </TabsContent>

                  {/* Results Section */}
                  {results.length > 0 && (
                    <>
                      <Separator className="my-6" />
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <h3 className="font-medium">Operation Results</h3>
                          <Button variant="ghost" size="sm" onClick={clearResults}>
                            Clear
                          </Button>
                        </div>
                        <div className="space-y-2">
                          {results.map((result, i) => (
                            <div
                              key={i}
                              className={`p-3 rounded-lg border ${
                                result.success 
                                  ? 'bg-green-500/5 border-green-500/20' 
                                  : 'bg-red-500/5 border-red-500/20'
                              }`}
                            >
                              <div className="flex items-center gap-2">
                                {result.success ? (
                                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                                ) : (
                                  <XCircle className="h-4 w-4 text-red-500" />
                                )}
                                <span className="font-medium text-sm">{result.repo}</span>
                                {result.filesAffected !== undefined && (
                                  <Badge variant="secondary" className="ml-auto">
                                    {result.filesAffected} files
                                  </Badge>
                                )}
                              </div>
                              <p className="text-xs text-muted-foreground mt-1 pl-6">
                                {result.message}
                              </p>
                            </div>
                          ))}
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </ScrollArea>
            </Tabs>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

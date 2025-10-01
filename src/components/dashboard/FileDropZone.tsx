import { useState, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Upload, FileText, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface FileDropZoneProps {
  repo: any;
  accountId: string;
}

const FileDropZone = ({ repo, accountId }: FileDropZoneProps) => {
  const [isDragging, setIsDragging] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [commitMessage, setCommitMessage] = useState("");

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    const droppedFiles = Array.from(e.dataTransfer.files);
    setFiles(droppedFiles);
    toast.success(`${droppedFiles.length} file(s) added`);
  }, []);

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const selectedFiles = Array.from(e.target.files);
      setFiles(selectedFiles);
      toast.success(`${selectedFiles.length} file(s) added`);
    }
  };

  const handleSync = async () => {
    if (files.length === 0) {
      toast.error("Please add files to sync");
      return;
    }
    
    if (!commitMessage.trim()) {
      toast.error("Please enter a commit message");
      return;
    }

    toast.info("Sync functionality coming soon! This is a demo interface.");
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Upload className="w-5 h-5" />
          Sync Files
        </CardTitle>
        <CardDescription>
          Drag and drop files or folders to sync with {repo.full_name}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            This is a demo interface. Full GitHub integration with file comparison and push functionality is coming soon.
          </AlertDescription>
        </Alert>

        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={`border-2 border-dashed rounded-lg p-12 text-center transition-all ${
            isDragging 
              ? "border-primary bg-primary/5 drag-over" 
              : "border-border hover:border-primary/50"
          }`}
        >
          <Upload className={`w-12 h-12 mx-auto mb-4 ${isDragging ? "text-primary" : "text-muted-foreground"}`} />
          <p className="text-lg font-medium mb-2">
            {isDragging ? "Drop files here" : "Drag & drop files or folders"}
          </p>
          <p className="text-sm text-muted-foreground mb-4">
            or click to browse
          </p>
          <Input
            type="file"
            multiple
            onChange={handleFileInput}
            className="max-w-xs mx-auto cursor-pointer"
          />
        </div>

        {files.length > 0 && (
          <div className="space-y-2">
            <Label>Selected Files ({files.length})</Label>
            <div className="max-h-40 overflow-y-auto space-y-1 p-3 bg-muted/30 rounded-md">
              {files.map((file, index) => (
                <div key={index} className="flex items-center gap-2 text-sm">
                  <FileText className="w-4 h-4 text-primary" />
                  <span className="truncate">{file.name}</span>
                  <span className="text-muted-foreground text-xs ml-auto">
                    {(file.size / 1024).toFixed(1)} KB
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="space-y-2">
          <Label htmlFor="commit-message">Commit Message</Label>
          <Input
            id="commit-message"
            placeholder="Update files from local folder"
            value={commitMessage}
            onChange={(e) => setCommitMessage(e.target.value)}
          />
        </div>

        <Button 
          onClick={handleSync} 
          className="w-full"
          disabled={files.length === 0 || !commitMessage.trim()}
        >
          <Upload className="w-4 h-4 mr-2" />
          Sync & Push to GitHub
        </Button>
      </CardContent>
    </Card>
  );
};

export default FileDropZone;

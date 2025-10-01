import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { GitBranch, Star, Lock } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface RepositorySelectorProps {
  accountId: string;
  onSelectRepo: (repo: any) => void;
}

// Mock repositories for demo
const mockRepos = [
  {
    id: "1",
    name: "my-awesome-project",
    full_name: "username/my-awesome-project",
    description: "An awesome web application",
    private: false,
    stars: 42,
    default_branch: "main",
  },
  {
    id: "2",
    name: "personal-website",
    full_name: "username/personal-website",
    description: "My personal portfolio site",
    private: true,
    stars: 5,
    default_branch: "main",
  },
  {
    id: "3",
    name: "data-analysis-tool",
    full_name: "username/data-analysis-tool",
    description: "Python tool for data analysis",
    private: false,
    stars: 128,
    default_branch: "master",
  },
];

const RepositorySelector = ({ accountId, onSelectRepo }: RepositorySelectorProps) => {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <GitBranch className="w-5 h-5" />
          Select Repository
        </CardTitle>
        <CardDescription>
          Choose a repository to sync with
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {mockRepos.map((repo) => (
            <button
              key={repo.id}
              onClick={() => onSelectRepo(repo)}
              className="p-4 rounded-lg border-2 border-border hover:border-primary/50 transition-all text-left group"
            >
              <div className="space-y-2">
                <div className="flex items-start justify-between">
                  <div className="font-semibold group-hover:text-primary transition-colors">
                    {repo.name}
                  </div>
                  {repo.private && <Lock className="w-4 h-4 text-muted-foreground" />}
                </div>
                
                <p className="text-sm text-muted-foreground line-clamp-2">
                  {repo.description}
                </p>
                
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <div className="flex items-center gap-1">
                    <Star className="w-3 h-3" />
                    {repo.stars}
                  </div>
                  <Badge variant="outline" className="text-xs">
                    {repo.default_branch}
                  </Badge>
                </div>
              </div>
            </button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};

export default RepositorySelector;

import { ArrowLeft, Github, Code, GitBranch, Webhook, FolderSync, Shield, Terminal } from "lucide-react";
import { Link } from "react-router-dom";

const sections = [
  {
    icon: Code, title: "Quick Start",
    content: `1. **Sign up** using email, Google, or GitHub.\n2. **Connect** your GitHub account from the dashboard.\n3. **Create** a sync group and select a source (mother) repository.\n4. **Add** target repositories to the group.\n5. **Sync** — GitSync copies files from source to all targets.`,
  },
  {
    icon: GitBranch, title: "Sync Modes",
    content: `**Direct Push** — Changes are pushed directly to the target's default branch.\n**Pull Request** — Changes are submitted as a PR for review before merging.\n**Selective Sync** — Choose specific files or folders to sync instead of the entire repo.`,
  },
  {
    icon: FolderSync, title: "Sync Groups",
    content: `A sync group links one source repository to one or more target repositories. All targets in a group receive the same files. You can create multiple groups per GitHub account.`,
  },
  {
    icon: Webhook, title: "Webhooks",
    content: `Register webhooks on your source repository to trigger automatic syncs on every push. GitSync listens for push events and initiates sync operations in real-time.`,
  },
  {
    icon: Shield, title: "Authentication & Security",
    content: `GitSync uses GitHub OAuth with the \`repo\` and \`user:email\` scopes. Tokens are encrypted at rest. You can connect multiple GitHub accounts. Revoke access anytime from GitHub → Settings → Applications.`,
  },
  {
    icon: Terminal, title: "API & Edge Functions",
    content: `GitSync is powered by serverless edge functions for all GitHub operations: browsing repos, reading/writing files, creating repos, syncing, and webhook management. All operations are authenticated and scoped to your session.`,
  },
];

const Docs = () => (
  <div className="min-h-screen bg-background text-foreground">
    <header className="border-b border-border sticky top-0 bg-background/80 backdrop-blur-xl z-10">
      <div className="max-w-4xl mx-auto px-6 py-4 flex items-center gap-4">
        <Link to="/" className="p-2 rounded-full hover:bg-secondary transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <Github className="w-6 h-6 text-primary" />
        <span className="font-bold text-lg">GitSync</span>
      </div>
    </header>

    <main className="max-w-4xl mx-auto px-6 py-12 space-y-10">
      <div className="space-y-4">
        <h1 className="text-4xl font-black tracking-tight">Documentation</h1>
        <p className="text-muted-foreground text-lg">Technical reference for GitSync's features and capabilities.</p>
      </div>

      {sections.map(({ icon: Icon, title, content }) => (
        <section key={title} className="p-6 rounded-xl bg-card border border-border space-y-4">
          <div className="flex items-center gap-3">
            <Icon className="w-6 h-6 text-primary" />
            <h2 className="text-xl font-bold">{title}</h2>
          </div>
          <div className="text-muted-foreground leading-relaxed whitespace-pre-line text-sm">
            {content.split(/\*\*(.*?)\*\*/g).map((part, i) =>
              i % 2 === 1 ? <span key={i} className="text-foreground font-semibold">{part}</span> : part
            )}
          </div>
        </section>
      ))}

      <footer className="pt-8 border-t border-border text-sm text-muted-foreground">
        © 2026 GitSync. Built by Kenny. All rights reserved.
      </footer>
    </main>
  </div>
);

export default Docs;

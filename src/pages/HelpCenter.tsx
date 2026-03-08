import { ArrowLeft, Github, BookOpen, GitBranch, Shield, Zap, Users, HelpCircle } from "lucide-react";
import { Link } from "react-router-dom";

const topics = [
  { icon: BookOpen, title: "Getting Started", items: ["Create an account using email, Google, or GitHub", "Connect your first GitHub account via OAuth", "Create a sync group and add repositories", "Run your first sync operation"] },
  { icon: GitBranch, title: "Syncing Repositories", items: ["Choose a mother (source) repository for your sync group", "Add target repositories to receive synced files", "Use webhooks for automatic sync on push", "View sync history and track file changes"] },
  { icon: Shield, title: "Security & Permissions", items: ["GitSync uses OAuth — we never store your GitHub password", "Access tokens are encrypted at rest", "Revoke access anytime from GitHub settings", "Workspace roles control who can sync"] },
  { icon: Zap, title: "Webhooks & Automation", items: ["Register webhooks to auto-sync on push events", "Configure CI triggers for post-sync workflows", "Monitor webhook delivery status", "Set up notification channels for sync events"] },
  { icon: Users, title: "Workspaces & Teams", items: ["Create workspaces to organize sync groups", "Invite team members with role-based access", "Roles: Owner, Admin, Syncer, Viewer", "Approval workflows for controlled syncing"] },
  { icon: HelpCircle, title: "Troubleshooting", items: ["Sync failed? Check your GitHub token permissions", "Invalid Blob SHA errors — re-sync from source", "Webhook not firing? Verify the webhook URL", "Contact support through the Help Center"] },
];

const HelpCenter = () => (
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

    <main className="max-w-4xl mx-auto px-6 py-12 space-y-12">
      <div className="space-y-4">
        <h1 className="text-4xl font-black tracking-tight">Help Center</h1>
        <p className="text-muted-foreground text-lg">Everything you need to know about using GitSync.</p>
      </div>

      <div className="grid sm:grid-cols-2 gap-6">
        {topics.map(({ icon: Icon, title, items }) => (
          <div key={title} className="p-6 rounded-xl bg-card border border-border space-y-4">
            <div className="flex items-center gap-3">
              <Icon className="w-6 h-6 text-primary" />
              <h2 className="font-bold text-lg">{title}</h2>
            </div>
            <ul className="space-y-2">
              {items.map((item) => (
                <li key={item} className="text-muted-foreground text-sm flex items-start gap-2">
                  <span className="text-primary mt-1.5 w-1 h-1 rounded-full bg-primary shrink-0" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <section className="p-6 rounded-xl bg-card border border-border space-y-3">
        <h2 className="font-bold text-lg">Still need help?</h2>
        <p className="text-muted-foreground text-sm">
          GitSync is in Beta and actively being developed by Kenny. If you have questions, feedback, or bug reports, feel free to reach out — your input helps shape the product.
        </p>
      </section>

      <footer className="pt-8 border-t border-border text-sm text-muted-foreground">
        © 2026 GitSync. All rights reserved.
      </footer>
    </main>
  </div>
);

export default HelpCenter;

import { ArrowLeft, Github, Users, Zap, Shield, Globe } from "lucide-react";
import { Link } from "react-router-dom";

const About = () => (
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
        <h1 className="text-4xl font-black tracking-tight">About GitSync</h1>
        <p className="text-muted-foreground text-lg max-w-2xl">
          GitSync is a powerful repository synchronization platform built to keep your codebases in perfect harmony across multiple GitHub repositories.
        </p>
      </div>

      <div className="grid sm:grid-cols-2 gap-6">
        {[
          { icon: Zap, title: "Lightning Fast Sync", desc: "Synchronize files across repositories in seconds, not minutes." },
          { icon: Shield, title: "Secure by Design", desc: "Your tokens and code are encrypted end-to-end. We never store your source code." },
          { icon: Users, title: "Team Collaboration", desc: "Workspaces, roles, and approval workflows for teams of any size." },
          { icon: Globe, title: "Open Ecosystem", desc: "Webhooks, CI triggers, and API-first design for seamless integrations." },
        ].map(({ icon: Icon, title, desc }) => (
          <div key={title} className="p-6 rounded-xl bg-card border border-border space-y-3">
            <Icon className="w-8 h-8 text-primary" />
            <h3 className="font-bold text-lg">{title}</h3>
            <p className="text-muted-foreground text-sm">{desc}</p>
          </div>
        ))}
      </div>

      <section className="space-y-4">
        <h2 className="text-2xl font-bold">Our Mission</h2>
        <p className="text-muted-foreground leading-relaxed">
          We believe developers shouldn't waste time manually copying files between repositories. GitSync automates the tedious parts of multi-repo management so you can focus on writing great code. Whether you're managing a design system shared across 50 projects or keeping config files in sync, GitSync has you covered.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-2xl font-bold">Credits</h2>
        <p className="text-muted-foreground leading-relaxed">
          GitSync is designed and developed by <span className="text-foreground font-semibold">Kenny</span>. Built with passion for the developer community using React, TypeScript, and Lovable Cloud.
        </p>
        <p className="text-muted-foreground text-sm">
          Special thanks to the open-source community and all our beta testers who provide invaluable feedback.
        </p>
      </section>

      <footer className="pt-8 border-t border-border text-sm text-muted-foreground">
        © 2026 GitSync. All rights reserved.
      </footer>
    </main>
  </div>
);

export default About;

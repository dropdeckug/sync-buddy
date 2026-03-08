import { ArrowLeft, Github } from "lucide-react";
import { Link } from "react-router-dom";

const Cookies = () => (
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

    <main className="max-w-4xl mx-auto px-6 py-12 space-y-8">
      <div className="space-y-2">
        <h1 className="text-4xl font-black tracking-tight">Cookie Policy</h1>
        <p className="text-muted-foreground">Last updated: March 8, 2026</p>
      </div>

      {[
        { title: "What Are Cookies", content: "Cookies are small text files stored on your device when you visit a website. They help websites remember your preferences and improve your experience." },
        { title: "How We Use Cookies", content: "GitSync uses only essential cookies required for the service to function. These include authentication session tokens and security cookies that keep your account safe." },
        { title: "Types of Cookies We Use", content: "Essential Cookies: Required for authentication and core functionality. These cannot be disabled. Session Storage: Used to maintain your login state and UI preferences during your visit. Local Storage: Used to cache certain settings for a better experience." },
        { title: "Third-Party Cookies", content: "We do not use third-party advertising or tracking cookies. If you sign in via Google or GitHub OAuth, those providers may set their own cookies during the authentication flow." },
        { title: "Managing Cookies", content: "You can manage cookies through your browser settings. Note that disabling essential cookies may prevent you from using GitSync, as they are required for authentication." },
        { title: "Changes to This Policy", content: "We may update this Cookie Policy from time to time. Any changes will be reflected on this page with an updated date." },
      ].map(({ title, content }) => (
        <section key={title} className="space-y-2">
          <h2 className="text-xl font-bold">{title}</h2>
          <p className="text-muted-foreground leading-relaxed">{content}</p>
        </section>
      ))}

      <footer className="pt-8 border-t border-border text-sm text-muted-foreground">
        © 2026 GitSync. All rights reserved.
      </footer>
    </main>
  </div>
);

export default Cookies;

import { ArrowLeft, Github } from "lucide-react";
import { Link } from "react-router-dom";

const Terms = () => (
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
        <h1 className="text-4xl font-black tracking-tight">Terms of Service</h1>
        <p className="text-muted-foreground">Last updated: March 8, 2026</p>
      </div>

      {[
        { title: "1. Acceptance of Terms", content: "By accessing or using GitSync (the \"Service\"), you agree to be bound by these Terms of Service. If you do not agree to these terms, please do not use the Service." },
        { title: "2. Description of Service", content: "GitSync provides a repository synchronization platform that allows users to sync files across multiple GitHub repositories. The Service is currently in Beta and features may change without notice." },
        { title: "3. User Accounts", content: "You must provide accurate and complete information when creating an account. You are responsible for maintaining the security of your account credentials. You must be at least 13 years of age to use the Service." },
        { title: "4. Acceptable Use", content: "You agree not to misuse the Service, including but not limited to: attempting to gain unauthorized access, interfering with other users' access, transmitting malicious code, or using the Service for any unlawful purpose." },
        { title: "5. GitHub Integration", content: "GitSync connects to your GitHub account via OAuth. You authorize GitSync to access your repositories as permitted by the scopes you grant. You may revoke access at any time through your GitHub settings." },
        { title: "6. Data & Privacy", content: "Your use of the Service is also governed by our Privacy Policy. We do not permanently store your source code — files are read and written in transit during sync operations." },
        { title: "7. Beta Disclaimer", content: "GitSync is currently in Beta. The Service is provided \"as is\" without warranties of any kind. We do not guarantee uptime, data integrity, or uninterrupted access during the Beta period." },
        { title: "8. Limitation of Liability", content: "To the maximum extent permitted by law, GitSync and its creators shall not be liable for any indirect, incidental, special, or consequential damages arising from your use of the Service." },
        { title: "9. Termination", content: "We reserve the right to suspend or terminate your access to the Service at any time, with or without cause. You may delete your account at any time." },
        { title: "10. Changes to Terms", content: "We may update these Terms from time to time. Continued use of the Service after changes constitutes acceptance of the updated Terms." },
        { title: "11. Contact", content: "For questions about these Terms, please reach out through our Help Center or contact the GitSync team directly." },
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

export default Terms;

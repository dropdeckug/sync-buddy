import { ArrowLeft, Github } from "lucide-react";
import { Link } from "react-router-dom";

const Privacy = () => (
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
        <h1 className="text-4xl font-black tracking-tight">Privacy Policy</h1>
        <p className="text-muted-foreground">Last updated: March 8, 2026</p>
      </div>

      {[
        { title: "Information We Collect", content: "We collect your email address and basic profile information when you create an account. When you connect GitHub, we receive your GitHub username, user ID, and an OAuth access token scoped to the permissions you grant." },
        { title: "How We Use Your Information", content: "Your information is used solely to provide the GitSync service: authenticating you, connecting to your GitHub repositories, and performing sync operations you initiate. We do not sell your data to third parties." },
        { title: "Data Storage", content: "Account data is stored securely in our cloud database. GitHub access tokens are encrypted at rest. We do not permanently store your source code — files are read and written only during active sync operations." },
        { title: "Third-Party Services", content: "GitSync integrates with GitHub via their OAuth API. Your use of GitHub is subject to GitHub's own Terms of Service and Privacy Policy. We may use analytics services to improve the product." },
        { title: "Cookies", content: "We use essential cookies and local storage to maintain your authentication session. We do not use tracking cookies for advertising purposes. See our Cookie Policy for more details." },
        { title: "Data Retention", content: "We retain your account data for as long as your account is active. Sync history and activity logs are retained for up to 90 days. You may request deletion of your data at any time." },
        { title: "Your Rights", content: "You have the right to access, correct, or delete your personal data. You can revoke GitHub access at any time through your GitHub settings. To request data deletion, contact us through the Help Center." },
        { title: "Security", content: "We implement industry-standard security measures including encryption in transit (TLS), encrypted storage for sensitive tokens, and role-based access controls." },
        { title: "Changes to This Policy", content: "We may update this Privacy Policy from time to time. We will notify you of significant changes via email or an in-app notification." },
        { title: "Contact Us", content: "If you have questions about this Privacy Policy, please reach out through our Help Center or contact the GitSync team." },
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

export default Privacy;

import { ArrowLeft, Github } from "lucide-react";
import { Link } from "react-router-dom";

const Accessibility = () => (
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
        <h1 className="text-4xl font-black tracking-tight">Accessibility</h1>
        <p className="text-muted-foreground text-lg">Our commitment to making GitSync usable for everyone.</p>
      </div>

      {[
        { title: "Our Commitment", content: "GitSync is committed to ensuring digital accessibility for people with disabilities. We continually improve the user experience for everyone and apply the relevant accessibility standards." },
        { title: "Standards", content: "We aim to conform to the Web Content Accessibility Guidelines (WCAG) 2.1 Level AA. These guidelines help make web content more accessible to people with a wide range of disabilities." },
        { title: "Features", content: "GitSync includes: keyboard navigation support throughout the application, semantic HTML for screen reader compatibility, sufficient color contrast ratios in our design system, focus indicators for interactive elements, and responsive design that works across devices and zoom levels." },
        { title: "Known Limitations", content: "As GitSync is in Beta, some features may not yet meet all accessibility standards. We are actively working to identify and address these gaps. The code editor component has limited screen reader support due to third-party constraints." },
        { title: "Feedback", content: "We welcome your feedback on the accessibility of GitSync. If you encounter any barriers or have suggestions, please contact us through our Help Center. We take all feedback seriously and will work to address issues promptly." },
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

export default Accessibility;

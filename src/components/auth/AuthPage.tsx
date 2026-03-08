import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Github, ArrowLeft, Mail, Loader2 } from "lucide-react";
import { Link } from "react-router-dom";

type AuthView = "main" | "signin" | "signup" | "reset";

const AuthPage = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [githubLoading, setGithubLoading] = useState(false);
  const [view, setView] = useState<AuthView>("main");

  // Handle GitHub OAuth callback
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    const ghAuth = params.get("gh_auth");
    
    if (!code || ghAuth !== "1") return;
    
    // Clear URL immediately
    window.history.replaceState({}, document.title, window.location.pathname);
    
    setGithubLoading(true);
    
    const exchangeCode = async () => {
      try {
        const { data, error } = await supabase.functions.invoke("github-auth-signin", {
          body: { code },
        });

        if (error) throw new Error(error.message);
        if (data?.error) throw new Error(data.error);

        // Use the token_hash to verify and create a session
        if (data.token_hash && data.email) {
          const { error: verifyErr } = await supabase.auth.verifyOtp({
            token_hash: data.token_hash,
            type: "magiclink",
          });

          if (verifyErr) throw new Error(verifyErr.message);

          toast.success(
            data.is_new_user
              ? `Welcome ${data.github_username}! Account created with GitHub.`
              : `Welcome back, ${data.github_username}!`
          );
        }
      } catch (err: any) {
        console.error("GitHub sign-in error:", err);
        toast.error(err.message || "GitHub sign-in failed");
      } finally {
        setGithubLoading(false);
      }
    };

    exchangeCode();
  }, []);

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/`
        }
      });

      if (error) throw error;
      toast.success("Check your email to confirm your account!");
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) throw error;
      toast.success("Signed in successfully!");
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/`,
      });

      if (error) throw error;
      toast.success("Password reset email sent! Check your inbox.");
      setView("signin");
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/`,
        },
      });
      if (error) throw error;
    } catch (error: any) {
      toast.error(error.message);
      setLoading(false);
    }
  };

  const handleGitHubSignIn = () => {
    setLoading(true);
    const clientId = "Ov23liZn3iNBDM6FbPB8";
    const redirectUri = `${window.location.origin}/?gh_auth=1`;
    const scope = "repo user:email";
    window.location.href = `https://github.com/login/oauth/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scope)}`;
  };

  const resetForm = () => {
    setEmail("");
    setPassword("");
    setView("main");
  };

  // GitHub OAuth loading
  if (githubLoading) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-4">
        <Loader2 className="w-10 h-10 text-primary animate-spin" />
        <p className="text-muted-foreground font-medium">Signing in with GitHub...</p>
      </div>
    );
  }

  // Reset Password Form
  if (view === "reset") {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="w-full max-w-md space-y-8">
          <div className="flex items-center gap-4">
            <button 
              onClick={() => setView("signin")}
              className="p-2 rounded-full hover:bg-secondary transition-colors"
            >
              <ArrowLeft className="w-5 h-5 text-foreground" />
            </button>
            <Github className="w-8 h-8 text-primary" />
          </div>
          
          <div className="space-y-2">
            <h1 className="text-3xl font-bold text-foreground">Reset Password</h1>
            <p className="text-muted-foreground">
              Enter your email address and we'll send you a link to reset your password.
            </p>
          </div>

          <form onSubmit={handleResetPassword} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="reset-email" className="text-foreground">Email</Label>
              <Input
                id="reset-email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="bg-background border-border text-foreground placeholder:text-muted-foreground h-12"
              />
            </div>
            <Button 
              type="submit" 
              className="w-full h-12 bg-foreground text-background hover:bg-foreground/90 font-bold text-base rounded-full"
              disabled={loading}
            >
              {loading ? "Sending..." : "Send Reset Link"}
            </Button>
          </form>

          <p className="text-muted-foreground text-sm">
            Remember your password?{" "}
            <button 
              onClick={() => setView("signin")}
              className="text-primary hover:underline"
            >
              Sign in
            </button>
          </p>
        </div>
      </div>
    );
  }

  // Sign In Form
  if (view === "signin") {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="w-full max-w-md space-y-8">
          <div className="flex items-center gap-4">
            <button 
              onClick={resetForm}
              className="p-2 rounded-full hover:bg-secondary transition-colors"
            >
              <ArrowLeft className="w-5 h-5 text-foreground" />
            </button>
            <Github className="w-8 h-8 text-primary" />
          </div>
          
          <div className="space-y-2">
            <h1 className="text-3xl font-bold text-foreground">Sign in to GitSync</h1>
          </div>

          {/* OAuth Buttons */}
          <div className="space-y-3">
            <Button
              type="button"
              variant="outline"
              onClick={handleGoogleSignIn}
              disabled={loading}
              className="w-full h-12 border-border rounded-full font-medium flex items-center justify-center gap-3"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              Sign in with Google
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={handleGitHubSignIn}
              disabled={loading}
              className="w-full h-12 border-border rounded-full font-medium flex items-center justify-center gap-3"
            >
              <Github className="w-5 h-5" />
              Sign in with GitHub
            </Button>
          </div>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t border-border" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-background px-2 text-muted-foreground">or</span>
            </div>
          </div>

          <form onSubmit={handleSignIn} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="signin-email" className="text-foreground">Email</Label>
              <Input
                id="signin-email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="bg-background border-border text-foreground placeholder:text-muted-foreground h-12"
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="signin-password" className="text-foreground">Password</Label>
                <button 
                  type="button"
                  onClick={() => setView("reset")}
                  className="text-xs text-primary hover:underline"
                >
                  Forgot password?
                </button>
              </div>
              <Input
                id="signin-password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="bg-background border-border text-foreground h-12"
              />
            </div>
            <Button 
              type="submit" 
              className="w-full h-12 bg-foreground text-background hover:bg-foreground/90 font-bold text-base rounded-full"
              disabled={loading}
            >
              {loading ? "Signing in..." : "Sign In"}
            </Button>
          </form>

          <p className="text-muted-foreground text-sm">
            Don't have an account?{" "}
            <button 
              onClick={() => setView("signup")}
              className="text-primary hover:underline"
            >
              Sign up
            </button>
          </p>
        </div>
      </div>
    );
  }

  // Sign Up Form
  if (view === "signup") {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        {/* Main Content - Split Layout */}
        <div className="flex-1 flex flex-col lg:flex-row">
          {/* Left Side - Large Logo */}
          <div className="flex-1 flex items-center justify-center p-8 lg:p-16">
            <Github className="w-32 h-32 sm:w-48 sm:h-48 lg:w-64 lg:h-64 text-foreground" />
          </div>

          {/* Right Side - Sign Up Form */}
          <div className="flex-1 flex items-center justify-center p-8 lg:p-16">
            <div className="w-full max-w-md space-y-8">
              <div className="flex items-center gap-4">
                <button 
                  onClick={resetForm}
                  className="p-2 rounded-full hover:bg-secondary transition-colors"
                >
                  <ArrowLeft className="w-5 h-5 text-foreground" />
                </button>
              </div>
              
              <div className="space-y-2">
                <h1 className="text-3xl font-bold text-foreground">Create your account</h1>
              </div>

              {/* OAuth Buttons */}
              <div className="space-y-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleGoogleSignIn}
                  disabled={loading}
                  className="w-full h-12 border-border rounded-full font-medium flex items-center justify-center gap-3"
                >
                  <svg className="w-5 h-5" viewBox="0 0 24 24">
                    <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                    <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                    <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                    <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                  </svg>
                  Sign up with Google
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleGitHubSignIn}
                  disabled={loading}
                  className="w-full h-12 border-border rounded-full font-medium flex items-center justify-center gap-3"
                >
                  <Github className="w-5 h-5" />
                  Sign up with GitHub
                </Button>
              </div>

              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t border-border" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-background px-2 text-muted-foreground">or</span>
                </div>
              </div>

              <form onSubmit={handleSignUp} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="signup-email" className="text-foreground">Email</Label>
                  <Input
                    id="signup-email"
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="bg-background border-border text-foreground placeholder:text-muted-foreground h-12"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="signup-password" className="text-foreground">Password</Label>
                  <Input
                    id="signup-password"
                    type="password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={6}
                    className="bg-background border-border text-foreground h-12"
                  />
                </div>
                <Button 
                  type="submit" 
                  className="w-full h-12 bg-primary text-primary-foreground hover:bg-primary/90 font-bold text-base rounded-full"
                  disabled={loading}
                >
                  {loading ? "Creating account..." : "Create Account"}
                </Button>
              </form>

              <p className="text-muted-foreground text-sm">
                By signing up, you agree to the{" "}
                <Link to="/terms" className="text-primary hover:underline">Terms of Service</Link>
                {" "}and{" "}
                <Link to="/privacy" className="text-primary hover:underline">Privacy Policy</Link>.
              </p>

              <p className="text-muted-foreground text-sm">
                Already have an account?{" "}
                <button 
                  onClick={() => setView("signin")}
                  className="text-primary hover:underline"
                >
                  Sign in
                </button>
              </p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <footer className="py-4 px-8 border-t border-border">
          <div className="flex flex-wrap justify-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
            <Link to="/about" className="hover:underline">About</Link>
            <Link to="/help" className="hover:underline">Help Center</Link>
            <Link to="/terms" className="hover:underline">Terms of Service</Link>
            <Link to="/privacy" className="hover:underline">Privacy Policy</Link>
            <Link to="/cookies" className="hover:underline">Cookie Policy</Link>
            <Link to="/accessibility" className="hover:underline">Accessibility</Link>
            <Link to="/docs" className="hover:underline">Docs</Link>
            <span>© 2026 GitSync</span>
          </div>
        </footer>
      </div>
    );
  }

  // Main View - X-style layout
  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Main Content */}
      <div className="flex-1 flex flex-col lg:flex-row">
        {/* Left Side - Large Logo */}
        <div className="flex-1 flex items-center justify-center p-8 lg:p-16">
          <Github className="w-32 h-32 sm:w-48 sm:h-48 lg:w-64 lg:h-64 text-foreground" />
        </div>

        {/* Right Side - Auth Options */}
        <div className="flex-1 flex items-center justify-center p-8 lg:p-16">
          <div className="w-full max-w-md space-y-8">
            {/* Heading */}
            <div className="space-y-4">
              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black text-foreground tracking-tight">
                Sync now
              </h1>
              <h2 className="text-2xl sm:text-3xl font-bold text-foreground">
                Join today.
              </h2>
            </div>

            {/* OAuth Buttons */}
            <div className="space-y-3 max-w-xs">
              <Button
                onClick={handleGoogleSignIn}
                variant="outline"
                disabled={loading}
                className="w-full h-11 border-border rounded-full font-medium flex items-center justify-center gap-3"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24">
                  <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                  <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
                Sign up with Google
              </Button>
              <Button
                onClick={handleGitHubSignIn}
                variant="outline"
                disabled={loading}
                className="w-full h-11 border-border rounded-full font-medium flex items-center justify-center gap-3"
              >
                <Github className="w-5 h-5" />
                Sign up with GitHub
              </Button>
            </div>

            <div className="relative max-w-xs">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-border" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-background px-2 text-muted-foreground">or</span>
              </div>
            </div>

            {/* Auth Buttons */}
            <div className="space-y-3 max-w-xs">
              <Button
                onClick={() => setView("signup")}
                className="w-full h-11 bg-primary text-primary-foreground hover:bg-primary/90 font-bold rounded-full"
              >
                Create account
              </Button>

              <p className="text-xs text-muted-foreground px-2">
                By signing up, you agree to the{" "}
                <span className="text-primary hover:underline cursor-pointer">Terms of Service</span>
                {" "}and{" "}
                <span className="text-primary hover:underline cursor-pointer">Privacy Policy</span>.
              </p>
            </div>

            {/* Already have account */}
            <div className="space-y-4 max-w-xs pt-8">
              <p className="text-foreground font-semibold">
                Already have an account?
              </p>
              <Button
                variant="outline"
                onClick={() => setView("signin")}
                className="w-full h-11 bg-transparent border-border text-primary hover:bg-primary/10 font-bold rounded-full"
              >
                Sign in
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="py-4 px-8 border-t border-border">
        <div className="flex flex-wrap justify-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
          <span className="hover:underline cursor-pointer">About</span>
          <span className="hover:underline cursor-pointer">Help Center</span>
          <span className="hover:underline cursor-pointer">Terms of Service</span>
          <span className="hover:underline cursor-pointer">Privacy Policy</span>
          <span className="hover:underline cursor-pointer">Cookie Policy</span>
          <span className="hover:underline cursor-pointer">Accessibility</span>
          <span>© 2026 GitSync</span>
        </div>
      </footer>
    </div>
  );
};

export default AuthPage;

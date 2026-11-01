import { useState } from "react";
import { motion } from "framer-motion";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { BRAND_NAME } from "@/lib/brand";
import { toast } from "sonner";

export default function Login() {
  const [isLoading, setIsLoading] = useState(false);
  const { signIn } = useAuth();
  const location = useLocation();

  // ProtectedRoute stashes the pre-login target (e.g. /create?name=X from the
  // share "make one for your name" CTA) as state.from, so the deep-link survives
  // the sign-in round-trip instead of always landing on "/".
  const from = location.state?.from as { pathname?: string; search?: string } | undefined;
  const returnTo = from?.pathname ? `${from.pathname}${from.search ?? ""}` : "/";

  const handleSignIn = async () => {
    setIsLoading(true);
    try {
      await signIn(returnTo);
    } catch {
      setIsLoading(false);
      toast.error("Couldn't reach the sign-in service. Try again shortly.");
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-sm space-y-6"
      >
        <div className="text-center space-y-2">
          <h1 className="text-xl font-bold text-foreground">
            Welcome back
          </h1>
          <p className="text-sm text-muted-foreground">
            Sign in to your {BRAND_NAME} account
          </p>
        </div>

        <div className="bg-card rounded-xl border border-border p-6">
          <button
            type="button"
            onClick={() => void handleSignIn()}
            disabled={isLoading}
            className="w-full bg-primary text-primary-foreground text-sm font-medium py-2.5 rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {isLoading ? "Opening sign-in…" : "Sign In"}
          </button>
        </div>

        <p className="text-center text-xs text-muted-foreground">
          Don't have an account?{" "}
          <Link to="/signup" state={location.state} className="text-primary hover:underline">
            Sign up
          </Link>
        </p>
      </motion.div>
    </div>
  );
}

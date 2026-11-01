import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { completeSignIn } from "@/integrations/auth/oidc";

export default function AuthCallback() {
  const navigate = useNavigate();
  const [failed, setFailed] = useState(false);
  // The sign-in code works once, and StrictMode runs effects twice.
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    completeSignIn()
      .then((target) => navigate(target, { replace: true }))
      .catch((err) => {
        console.error("Sign-in failed:", err);
        setFailed(true);
      });
  }, [navigate]);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      {failed ? (
        <div className="text-center space-y-2">
          <h1 className="text-xl font-bold text-foreground">Sign-in didn't finish</h1>
          <p className="text-sm text-muted-foreground">Your session was not started.</p>
          <Link to="/login" className="text-sm text-primary hover:underline">
            Try signing in again
          </Link>
        </div>
      ) : (
        <div
          role="status"
          aria-label="Signing you in"
          className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin"
        />
      )}
    </div>
  );
}

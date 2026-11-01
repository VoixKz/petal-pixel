import { useState } from 'react';
import { motion } from 'framer-motion';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

export default function Signup() {
  const [isLoading, setIsLoading] = useState(false);
  const { signUp } = useAuth();
  const location = useLocation();

  const from = location.state?.from as { pathname?: string; search?: string } | undefined;
  const returnTo = from?.pathname ? `${from.pathname}${from.search ?? ''}` : '/';

  const handleSignUp = async () => {
    setIsLoading(true);
    try {
      await signUp(returnTo);
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
          <h1 className="text-xl font-bold text-foreground">Create account</h1>
          <p className="text-sm text-muted-foreground">Start generating your unique 3D flowers</p>
        </div>

        <div className="bg-card rounded-xl border border-border p-6">
          <button
            type="button"
            onClick={() => void handleSignUp()}
            disabled={isLoading}
            className="w-full bg-primary text-primary-foreground text-sm font-medium py-2.5 rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {isLoading ? 'Opening sign-up…' : 'Create Account'}
          </button>
        </div>

        <p className="text-center text-xs text-muted-foreground">
          Already have an account?{' '}
          <Link to="/login" state={location.state} className="text-primary hover:underline">Sign in</Link>
        </p>
      </motion.div>
    </div>
  );
}

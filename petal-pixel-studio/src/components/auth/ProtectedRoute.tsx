import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
    const { session, loading } = useAuth();
    const location = useLocation();

    if (loading) {
        return (
            <div className="min-h-screen bg-background flex items-center justify-center">
                <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
        );
    }

    if (!session) {
        // Preserve the full target (pathname + search) so a deep-link like
        // /create?name=X (the share "make one for your name" CTA) survives
        // the login round-trip instead of dropping back to "/" — see Login.tsx.
        return <Navigate to="/login" state={{ from: location }} replace />;
    }

    return <>{children}</>;
}
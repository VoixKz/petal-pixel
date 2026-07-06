import { Link, useLocation } from "react-router-dom";
import { useEffect } from "react";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background grid-bg p-6">
      <div className="glass-panel rounded-xl px-8 py-10 text-center max-w-sm w-full">
        <h1 className="mb-4 text-4xl font-mono font-bold text-foreground">404</h1>
        <p className="mb-4 text-lg sm:text-xl text-muted-foreground">Oops! Page not found</p>
        <Link
          to="/"
          className="inline-flex items-center justify-center h-10 px-4 rounded-lg text-sm font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          Return to Home
        </Link>
      </div>
    </div>
  );
};

export default NotFound;

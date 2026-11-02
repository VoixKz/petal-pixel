import { lazy, Suspense } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createBrowserRouter, RouterProvider, Outlet, Navigate } from "react-router-dom";
import { ThemeProvider } from "next-themes";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/AuthContext";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { PageErrorBoundary } from "./components/PageErrorBoundary";

const DashboardLayout = lazy(() => import("@/components/layout/DashboardLayout").then((m) => ({ default: m.DashboardLayout })));
const Landing = lazy(() => import("./pages/Landing"));
const Index = lazy(() => import("./pages/Index"));
const CreateFlower = lazy(() => import("./pages/CreateFlower"));
const MyFlowers = lazy(() => import("./pages/MyFlowers"));
const NftCollection = lazy(() => import("./pages/NftCollection"));
const Activity = lazy(() => import("./pages/Activity"));
const Profile = lazy(() => import("./pages/Profile"));
const SettingsPage = lazy(() => import("./pages/SettingsPage"));
const Login = lazy(() => import("./pages/Login"));
const Signup = lazy(() => import("./pages/Signup"));
const ForgotPassword = lazy(() => import("./pages/ForgotPassword"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
const AuthCallback = lazy(() => import("./pages/AuthCallback"));
const NotFound = lazy(() => import("./pages/NotFound"));
const ShareFlower = lazy(() => import("./pages/ShareFlower"));

function PageLoader() {
  return (
    <div className="w-full h-full min-h-[40vh] flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin motion-reduce:animate-none" />
    </div>
  );
}

const queryClient = new QueryClient();

function AppProviders() {
  return (
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <Sonner />
          <AuthProvider>
            <Outlet />
          </AuthProvider>
        </TooltipProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}

const router = createBrowserRouter([
  {
    element: <AppProviders />,
    children: [
      { path: "/", element: <PageErrorBoundary><Suspense fallback={null}><Landing /></Suspense></PageErrorBoundary> },
      { path: "/forgot-password", element: <Suspense fallback={<PageLoader />}><ForgotPassword /></Suspense> },
      { path: "/reset-password", element: <Suspense fallback={<PageLoader />}><ResetPassword /></Suspense> },
      { path: "/login", element: <Suspense fallback={<PageLoader />}><Login /></Suspense> },
      { path: "/signup", element: <Suspense fallback={<PageLoader />}><Signup /></Suspense> },
      { path: "/auth/callback", element: <Suspense fallback={<PageLoader />}><AuthCallback /></Suspense> },
      // Public, logged-out flower landing — sibling of ProtectedRoute so it is
      // reachable WITHOUT a session (crawlers + shared links).
      { path: "/share/:flowerId", element: <PageErrorBoundary><Suspense fallback={<PageLoader />}><ShareFlower /></Suspense></PageErrorBoundary> },
      {
        element: (
          <ProtectedRoute>
            <DashboardLayout />
          </ProtectedRoute>
        ),
        children: [
          { path: "/console", element: <PageErrorBoundary><Suspense fallback={<PageLoader />}><Index /></Suspense></PageErrorBoundary> },
          { path: "/create", element: <PageErrorBoundary><Suspense fallback={<PageLoader />}><CreateFlower /></Suspense></PageErrorBoundary> },
          { path: "/my-flowers", element: <PageErrorBoundary><Suspense fallback={<PageLoader />}><MyFlowers /></Suspense></PageErrorBoundary> },
          { path: "/nfts", element: <PageErrorBoundary><Suspense fallback={<PageLoader />}><NftCollection /></Suspense></PageErrorBoundary> },
          { path: "/activity", element: <PageErrorBoundary><Suspense fallback={<PageLoader />}><Activity /></Suspense></PageErrorBoundary> },
          { path: "/payments", element: <Navigate to="/activity" replace /> },
          { path: "/profile", element: <PageErrorBoundary><Suspense fallback={<PageLoader />}><Profile /></Suspense></PageErrorBoundary> },
          { path: "/settings", element: <PageErrorBoundary><Suspense fallback={<PageLoader />}><SettingsPage /></Suspense></PageErrorBoundary> },
        ],
      },
      { path: "*", element: <Suspense fallback={<PageLoader />}><NotFound /></Suspense> },
    ],
  },
]);

const App = () => <RouterProvider router={router} />;

export default App;

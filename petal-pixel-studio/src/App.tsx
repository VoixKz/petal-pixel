import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createBrowserRouter, RouterProvider, Outlet, Navigate } from "react-router-dom";
import { ThemeProvider } from "next-themes";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/AuthContext";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import Index from "./pages/Index";
import CreateFlower from "./pages/CreateFlower";
import MyFlowers from "./pages/MyFlowers";
import NftCollection from "./pages/NftCollection";
import Activity from "./pages/Activity";
import Profile from "./pages/Profile";
import SettingsPage from "./pages/SettingsPage";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import VerifyOtp from "./pages/VerifyOtp";
import NotFound from "./pages/NotFound";
import { PageErrorBoundary } from "./components/PageErrorBoundary";

const queryClient = new QueryClient();

function AppProviders() {
  return (
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
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
      { path: "/login", element: <Login /> },
      { path: "/signup", element: <Signup /> },
      { path: "/verify", element: <VerifyOtp /> },
      {
        element: (
          <ProtectedRoute>
            <DashboardLayout />
          </ProtectedRoute>
        ),
        children: [
          { path: "/", element: <PageErrorBoundary><Index /></PageErrorBoundary> },
          { path: "/create", element: <PageErrorBoundary><CreateFlower /></PageErrorBoundary> },
          { path: "/my-flowers", element: <PageErrorBoundary><MyFlowers /></PageErrorBoundary> },
          { path: "/nfts", element: <PageErrorBoundary><NftCollection /></PageErrorBoundary> },
          { path: "/activity", element: <PageErrorBoundary><Activity /></PageErrorBoundary> },
          { path: "/payments", element: <Navigate to="/activity" replace /> },
          { path: "/profile", element: <PageErrorBoundary><Profile /></PageErrorBoundary> },
          { path: "/settings", element: <PageErrorBoundary><SettingsPage /></PageErrorBoundary> },
        ],
      },
      { path: "*", element: <NotFound /> },
    ],
  },
]);

const App = () => <RouterProvider router={router} />;

export default App;

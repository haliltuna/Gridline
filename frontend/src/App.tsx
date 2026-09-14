import { Routes, Route, useLocation } from "react-router-dom";
import AuthCallback from "@/pages/AuthCallback";
import { Toaster } from "@/components/ui/sonner";
import Landing from "@/pages/Landing";
import Login from "@/pages/Login";
import Dashboard from "@/pages/Dashboard";
import UploadPage from "@/pages/Upload";
import Takeoff from "@/pages/Takeoff";
import Invoices from "@/pages/Invoices";
import Expenses from "@/pages/Expenses";
import SettingsPage from "@/pages/SettingsPage";
import Billing from "@/pages/Billing";
import Team from "@/pages/Team";
import Pay from "@/pages/Pay";
import Costing from "@/pages/Costing";
import Leads from "@/pages/Leads";
import LandingV2 from "@/pages/LandingV2";
import PaymentResult from "@/pages/PaymentResult";
import Products from "@/pages/Products";
import Approve from "@/pages/Approve";
import NotFoundPage from "@/pages/NotFoundPage";
import ErrorBoundary from "@/components/ErrorBoundary";

// One <Route> per page in src/pages; BrowserRouter already wraps this in main.tsx.
export default function App() {
  // Google sign-in lands on {origin}/dashboard#session_id=… — this must be checked during
  // render (not in an effect) so the one-time id is exchanged before any guarded route runs.
  const location = useLocation();
  if (location.hash.includes("session_id=")) return <AuthCallback />;
  return (
    <ErrorBoundary>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<Login />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/upload" element={<UploadPage />} />
        <Route path="/jobs/:jobId" element={<Takeoff />} />
        <Route path="/invoices" element={<Invoices />} />
        <Route path="/expenses" element={<Expenses />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/billing" element={<Billing />} />
        <Route path="/team" element={<Team />} />
        <Route path="/costing" element={<Costing />} />
        <Route path="/leads" element={<Leads />} />
        {/* Design variation of the landing page, kept side by side for comparison. */}
        <Route path="/v2" element={<LandingV2 />} />
        <Route path="/payment/success" element={<PaymentResult />} />
        <Route path="/payment/cancel" element={<PaymentResult cancelled />} />
        {/* Public: the client pays from an emailed link, with no Gridline account. */}
        <Route path="/pay/:payToken" element={<Pay />} />
        <Route path="/products" element={<Products />} />
        <Route path="/approve/:token" element={<Approve />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
      <Toaster richColors />
    </ErrorBoundary>
  );
}
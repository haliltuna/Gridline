import { Routes, Route } from "react-router-dom";
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

// One <Route> per page in src/pages; BrowserRouter already wraps this in main.tsx.
export default function App() {
  return (
    <>
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
        {/* Public: the client pays from an emailed link, with no Gridline account. */}
        <Route path="/pay/:payToken" element={<Pay />} />
        <Route path="*" element={<Landing />} />
      </Routes>
      <Toaster richColors />
    </>
  );
}

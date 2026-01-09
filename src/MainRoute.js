import { BrowserRouter, Routes, Route } from "react-router-dom";
import App from "./App";
import AdminLogin from "./Utils/AdminLogin";
import LandingAuth from "./Utils/LandingAuth";
import Dashboard from "./dashboard";
import ProtectedAdminRoutes from "./Utils/ProtectedAdminRoutes";

function MainRouter() {
  return (
    <BrowserRouter basename="/iptracker-main">
      <Routes>
        <Route path="/" element={<LandingAuth />} />
        <Route path="/admin-login" element={<AdminLogin />} />
        <Route path="/app" element={<App />} />

        {/* Only admin can access */}
        <Route element={<ProtectedAdminRoutes />}>
          <Route path="/admin_dashboard" element={<Dashboard />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default MainRouter;

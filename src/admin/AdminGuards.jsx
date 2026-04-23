import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAdminAuth } from "./AdminAuthContext.jsx";

export function AdminRouteGuard({ permission = "dashboard.view" }) {
  const location = useLocation();
  const { isLoading, user, hasPermission } = useAdminAuth();

  if (isLoading) {
    return <div className="admin-route-state">Loading admin access...</div>;
  }

  if (!user) {
    return <Navigate to="/admin/login" replace state={{ from: location.pathname }} />;
  }

  if (!hasPermission(permission)) {
    return <Navigate to="/admin/forbidden" replace />;
  }

  return <Outlet />;
}

export function PermissionGate({ permission, fallback = null, children }) {
  const { hasPermission } = useAdminAuth();

  if (!permission || hasPermission(permission)) {
    return children;
  }

  return fallback;
}

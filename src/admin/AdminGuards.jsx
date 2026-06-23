import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAdminAuth } from "./AdminAuthContext.jsx";
import { canAccessAdminRoute, getFirstAccessibleAdminRoute } from "./accessControl.js";

export function AdminRouteGuard({ permission = null, anyPermissions = [], allPermissions = [], children }) {
  const location = useLocation();
  const adminAuth = useAdminAuth();
  const { isLoading, user, isAdminUser, hasPermission, hasAnyPermission, hasAllPermissions } = adminAuth;

  if (isLoading) {
    return <div className="admin-route-state">Loading admin access...</div>;
  }

  if (!user) {
    return <Navigate to="/admin/login" replace state={{ from: location.pathname }} />;
  }

  if (!isAdminUser) {
    return <Navigate to="/admin/forbidden" replace />;
  }

  const isAllowed = (
    canAccessAdminRoute(adminAuth, location.pathname)
    && (!permission || hasPermission(permission))
    && (!anyPermissions?.length || hasAnyPermission(anyPermissions))
    && (!allPermissions?.length || hasAllPermissions(allPermissions))
  );

  if (!isAllowed) {
    const fallbackPath = getFirstAccessibleAdminRoute(adminAuth);
    if (fallbackPath && fallbackPath !== "/admin/forbidden" && fallbackPath !== location.pathname) {
      return <Navigate to={fallbackPath} replace />;
    }

    return <Navigate to="/admin/forbidden" replace />;
  }

  return children || <Outlet />;
}

export function PermissionGate({ permission, anyPermissions = [], allPermissions = [], fallback = null, children }) {
  const { hasPermission, hasAnyPermission, hasAllPermissions } = useAdminAuth();

  if (
    (!permission || hasPermission(permission))
    && (!anyPermissions?.length || hasAnyPermission(anyPermissions))
    && (!allPermissions?.length || hasAllPermissions(allPermissions))
  ) {
    return children;
  }

  return fallback;
}

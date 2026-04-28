import { Link, NavLink } from "react-router-dom";
import { useLocalizedPath } from "../i18n/useLocalizedPath.js";

export function LocalizedLink({ to, ...props }) {
  const toLocalizedPath = useLocalizedPath();
  return <Link to={toLocalizedPath(to)} {...props} />;
}

export function LocalizedNavLink({ to, ...props }) {
  const toLocalizedPath = useLocalizedPath();
  return <NavLink to={toLocalizedPath(to)} {...props} />;
}

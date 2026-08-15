import { Navigate, Outlet } from "react-router-dom";

/**
 * Layout route that gates its children on the presence of a session token.
 *
 * This is a convenience guard only -- it keeps unauthenticated users out of the
 * UI. It is NOT a security boundary: the API enforces authentication and
 * ownership on every request regardless of what the client does.
 *
 * The original destructured a `component` prop but then hardcoded HomePage,
 * so every protected route rendered HomePage no matter what was passed in.
 * Rendering <Outlet /> lets each nested route render its own element.
 */
const ProtectedRoute = () => {
  const token = sessionStorage.getItem("token");

  return token ? <Outlet /> : <Navigate to="/login" replace />;
};

export default ProtectedRoute;

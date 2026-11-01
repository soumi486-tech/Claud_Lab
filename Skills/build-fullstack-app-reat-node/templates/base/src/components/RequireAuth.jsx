import { Navigate, useLocation } from 'react-router-dom';
import { useSession } from '../lib/auth';

// Wrap routes that need a signed-in user; signed-out visitors go to /login and come back afterwards.
export default function RequireAuth({ children }) {
  const { data: session, isPending } = useSession();
  const location = useLocation();
  if (isPending) return <p className="muted">Loading…</p>;
  if (!session) return <Navigate to={`/login?next=${encodeURIComponent(location.pathname + location.search)}`} replace />;
  return children;
}

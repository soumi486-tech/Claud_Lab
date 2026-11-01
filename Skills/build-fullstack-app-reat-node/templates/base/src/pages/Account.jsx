import { useNavigate } from 'react-router-dom';
import { signOut, useSession } from '../lib/auth';

export default function Account() {
  const { data: session } = useSession();
  const navigate = useNavigate();
  return (
    <section className="panel">
      <h1>Account</h1>
      <p><strong>{session?.user.name}</strong><br /><span className="muted">{session?.user.email}</span></p>
      <button className="btn" onClick={async () => { await signOut(); navigate('/'); }}>Sign out</button>
    </section>
  );
}

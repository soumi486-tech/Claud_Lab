import { useState } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { signIn, signUp, useSession } from '../lib/auth';

// One page for both flows: /login and /signup.
export default function Login({ mode = 'login' }) {
  const isSignup = mode === 'signup';
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { data: session } = useSession();
  const next = params.get('next');
  const target = next && next.startsWith('/') && !next.startsWith('//') ? next : '/';
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (session) return <Navigate to={target} replace />;

  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const { error: err } = isSignup
      ? await signUp.email({ name: form.name.trim(), email: form.email.trim(), password: form.password })
      : await signIn.email({ email: form.email.trim(), password: form.password });
    setBusy(false);
    if (err) setError(err.message || 'Something went wrong');
    else navigate(target, { replace: true });
  }

  const other = `${isSignup ? '/login' : '/signup'}${next ? `?next=${encodeURIComponent(next)}` : ''}`;
  return (
    <form className="panel form auth-form" onSubmit={submit}>
      <h1>{isSignup ? 'Create account' : 'Sign in'}</h1>
      {isSignup && (
        <label className="field">Name
          <input value={form.name} onChange={set('name')} required maxLength={80} autoComplete="name" />
        </label>
      )}
      <label className="field">Email
        <input type="email" value={form.email} onChange={set('email')} required autoComplete="email" />
      </label>
      <label className="field">Password
        <input type="password" value={form.password} onChange={set('password')} required minLength={8}
          autoComplete={isSignup ? 'new-password' : 'current-password'} />
      </label>
      {error && <p className="error" role="alert">{error}</p>}
      <button className="btn btn-primary" disabled={busy}>{busy ? 'Please wait…' : isSignup ? 'Sign up' : 'Sign in'}</button>
      <p className="muted small">
        {isSignup ? 'Already have an account?' : 'New here?'} <Link to={other}>{isSignup ? 'Sign in' : 'Create an account'}</Link>
      </p>
    </form>
  );
}

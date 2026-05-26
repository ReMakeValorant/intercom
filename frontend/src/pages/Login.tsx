import { FormEvent, useState } from 'react';
import { Radio } from 'lucide-react';
import { api } from '../api/client';

export function Login({ onLogin }: { onLogin: (token: string, kind: 'admin' | 'user') => void }) {
  const [kind, setKind] = useState<'admin' | 'user'>('admin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError('');
    try {
      const res = await api.post(kind === 'admin' ? '/auth/login' : '/auth/user-login', { email, password });
      onLogin(res.data.token, kind);
    } catch {
      setError('Connexion impossible');
    }
  }

  return (
    <main className="login-page">
      <form className="login-card" onSubmit={submit} autoComplete="off">
        <Radio size={34} />
        <h1>Remake Intercom</h1>
        <div className="segmented">
          <button type="button" className={kind === 'admin' ? 'active' : ''} onClick={() => setKind('admin')}>Admin</button>
          <button type="button" className={kind === 'user' ? 'active' : ''} onClick={() => setKind('user')}>Utilisateur</button>
        </div>
        <label>Email<input autoComplete="off" name="login-email" value={email} onChange={(event) => setEmail(event.target.value)} /></label>
        <label>Mot de passe<input autoComplete="new-password" name="login-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} /></label>
        {error && <p className="error">{error}</p>}
        <button>Connexion</button>
      </form>
    </main>
  );
}

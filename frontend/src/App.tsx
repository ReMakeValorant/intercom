import { useEffect, useMemo, useState } from 'react';
import { Activity, Columns3, DoorOpen, FileClock, LayoutDashboard, LogOut, Radio, Shield, Users } from 'lucide-react';
import { api, socket } from './api/client';
import { CrudPanel } from './components/CrudPanel';
import { LiveIntercom } from './components/LiveIntercom';
import { Login } from './pages/Login';
import { Matrix } from './components/Matrix';
import { Overrides } from './components/Overrides';
import { PresetsLogs } from './components/PresetsLogs';
import { UserPortal } from './components/UserPortal';

type Tab = 'dashboard' | 'users' | 'roles' | 'rooms' | 'matrix' | 'overrides' | 'live' | 'logs';
type SessionKind = 'admin' | 'user';

const nav = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'users', label: 'Utilisateurs', icon: Users },
  { id: 'roles', label: 'Rôles', icon: Shield },
  { id: 'rooms', label: 'Salons', icon: DoorOpen },
  { id: 'matrix', label: 'Matrice', icon: Columns3 },
  { id: 'overrides', label: 'Overrides', icon: Radio },
  { id: 'live', label: 'Live', icon: Activity },
  { id: 'logs', label: 'Presets & logs', icon: FileClock }
] as const;

export function App() {
  const [token, setToken] = useState(localStorage.getItem('token'));
  const [sessionKind, setSessionKind] = useState<SessionKind>((localStorage.getItem('sessionKind') as SessionKind) || 'admin');
  const [tab, setTab] = useState<Tab>('dashboard');
  const [status, setStatus] = useState<any>(null);
  const [event, setEvent] = useState('En attente');

  useEffect(() => {
    if (!token || sessionKind !== 'admin') return;
    socket.connect();
    socket.on('permissions.modified', () => setEvent('Permissions modifiées'));
    socket.on('sync.completed', () => setEvent('Synchronisation terminée'));
    socket.on('sync.error', (payload) => setEvent(`Erreur sync: ${payload.message}`));
    api.get('/murmur/status').then((res) => setStatus(res.data)).catch(() => setStatus({ connected: false }));
    return () => {
      socket.disconnect();
      socket.removeAllListeners();
    };
  }, [token, sessionKind]);

  const content = useMemo(() => {
    if (tab === 'users') return <CrudPanel kind="users" />;
    if (tab === 'roles') return <CrudPanel kind="roles" />;
    if (tab === 'rooms') return <CrudPanel kind="rooms" />;
    if (tab === 'matrix') return <Matrix />;
    if (tab === 'overrides') return <Overrides />;
    if (tab === 'live') return <LiveIntercom />;
    if (tab === 'logs') return <PresetsLogs />;
    return (
      <section className="dashboard-grid">
        <div className="metric"><span>API</span><strong>Connectée</strong></div>
        <div className="metric"><span>Murmur</span><strong>{status?.connected ? 'Connecté' : 'Adaptateur à brancher'}</strong></div>
        <div className="metric"><span>Endpoint Ice</span><strong>{status?.endpoint || '127.0.0.1:6502'}</strong></div>
        <div className="metric"><span>Temps réel</span><strong>{event}</strong></div>
      </section>
    );
  }, [tab, status, event]);

  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('sessionKind');
    setToken(null);
  };

  if (!token) {
    return <Login onLogin={(nextToken, kind) => {
      localStorage.setItem('token', nextToken);
      localStorage.setItem('sessionKind', kind);
      setSessionKind(kind);
      setToken(nextToken);
    }} />;
  }

  if (sessionKind === 'user') return <UserPortal onLogout={logout} />;

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <Radio />
          <div><strong>Remake Intercom</strong><span>remakemedia.fr</span></div>
        </div>
        <nav>
          {nav.map((item) => {
            const Icon = item.icon;
            return <button key={item.id} className={tab === item.id ? 'active' : ''} onClick={() => setTab(item.id as Tab)}><Icon size={18} />{item.label}</button>;
          })}
        </nav>
        <button className="logout" onClick={logout}><LogOut size={18} />Déconnexion</button>
      </aside>
      <main>
        <header className="topbar">
          <div>
            <h1>{nav.find((item) => item.id === tab)?.label}</h1>
            <p>Administration salons, rôles, ACL et actions live Mumble/Murmur.</p>
          </div>
          <button onClick={() => api.post('/sync/murmur').catch((err) => alert(err.response?.data?.message || err.message))}>Synchroniser Murmur</button>
        </header>
        {content}
      </main>
    </div>
  );
}

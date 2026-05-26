import { FormEvent, useEffect, useMemo, useState } from 'react';
import { BadgePlus, KeyRound, Mail, Plus, Trash2, UserRound } from 'lucide-react';
import { api } from '../api/client';

type Role = { id: string; name: string; color: string };

export function CrudPanel({ kind }: { kind: 'users' | 'roles' | 'rooms' }) {
  const [items, setItems] = useState<any[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [form, setForm] = useState<any>({});
  const [error, setError] = useState('');

  const load = () => api.get(`/${kind}`).then((res) => setItems(res.data));

  useEffect(() => {
    load();
    if (kind === 'users') api.get('/roles').then((res) => setRoles(res.data));
  }, [kind]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError('');
    try {
      await api.post(`/${kind}`, normalize(kind, form));
      setForm({});
      load();
    } catch (err: any) {
      setError(formatApiError(err));
    }
  }

  async function remove(id: string) {
    if (!confirm('Confirmer la suppression ?')) return;
    await api.delete(`/${kind}/${id}`);
    load();
  }

  async function assignRole(userId: string, primaryRoleId: string) {
    await api.patch(`/users/${userId}`, { primaryRoleId: primaryRoleId || null });
    load();
  }

  async function toggleRole(user: any, roleId: string) {
    const current = new Set((user.roles || []).map((entry: any) => entry.roleId));
    current.has(roleId) ? current.delete(roleId) : current.add(roleId);
    await api.patch(`/users/${user.id}/roles`, { roleIds: Array.from(current) });
    load();
  }

  if (kind === 'users') {
    return (
      <section className="users-workspace">
        <form className="create-user-bar" onSubmit={submit}>
          <label><UserRound size={16} /><input placeholder="Nom affiché" value={form.displayName || ''} onChange={(event) => setForm({ ...form, displayName: event.target.value })} /></label>
          <label><Mail size={16} /><input placeholder="Email portail" value={form.email || ''} onChange={(event) => setForm({ ...form, email: event.target.value })} /></label>
          <label><KeyRound size={16} /><input type="password" placeholder="Mot de passe" value={form.password || ''} onChange={(event) => setForm({ ...form, password: event.target.value })} /></label>
          <label><BadgePlus size={16} /><select value={form.primaryRoleId || ''} onChange={(event) => setForm({ ...form, primaryRoleId: event.target.value || null })}>
            <option value="">Rôle principal</option>
            {roles.map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}
          </select></label>
          <button><Plus size={16} />Créer</button>
        </form>
        {error && <p className="form-error">{error}</p>}

        <div className="user-grid">
          {items.map((user) => (
            <UserCard
              key={user.id}
              user={user}
              roles={roles}
              onDelete={() => remove(user.id)}
              onPrimaryRole={(roleId) => assignRole(user.id, roleId)}
              onToggleRole={(roleId) => toggleRole(user, roleId)}
            />
          ))}
        </div>
      </section>
    );
  }

  return (
    <section className="panel">
      <form className="inline-form" onSubmit={submit}>
        {kind === 'roles' && <>
          <input placeholder="Nom" value={form.name || ''} onChange={(event) => setForm({ ...form, name: event.target.value })} />
          <input placeholder="Slug" value={form.slug || ''} onChange={(event) => setForm({ ...form, slug: event.target.value })} />
          <input type="color" value={form.color || '#60a5fa'} onChange={(event) => setForm({ ...form, color: event.target.value })} />
        </>}
        {kind === 'rooms' && <>
          <input placeholder="Nom" value={form.name || ''} onChange={(event) => setForm({ ...form, name: event.target.value })} />
          <input placeholder="Slug" value={form.slug || ''} onChange={(event) => setForm({ ...form, slug: event.target.value })} />
          <select value={form.type || 'production'} onChange={(event) => setForm({ ...form, type: event.target.value })}>
            <option value="production">Production</option>
            <option value="technique">Technique</option>
            <option value="externe">Externe</option>
            <option value="prive">Privé</option>
            <option value="help">Help</option>
          </select>
        </>}
        <button><Plus size={16} />Créer</button>
      </form>
      {error && <p className="form-error">{error}</p>}

      <div className="cards">
        {items.map((item) => (
          <article className="item-card" key={item.id}>
            <div>
              <strong>{item.displayName || item.name}</strong>
              <span>{item.email || item.slug || item.primaryRole?.name || 'Sans rôle'}</span>
            </div>
            {item.color && <i style={{ background: item.color }} />}
            <button className="icon" onClick={() => remove(item.id)} title="Supprimer"><Trash2 size={16} /></button>
          </article>
        ))}
      </div>
    </section>
  );
}

function formatApiError(err: any) {
  const data = err.response?.data;
  if (data?.issues?.length) {
    return data.issues.map((issue: any) => `${issue.path?.join('.') || 'champ'}: ${issue.message}`).join(' · ');
  }
  if (data?.message === 'Une valeur unique existe déjà') {
    return 'Cet email, nom ou slug existe déjà.';
  }
  return data?.message || err.message || 'Action impossible';
}

function UserCard({ user, roles, onDelete, onPrimaryRole, onToggleRole }: {
  user: any;
  roles: Role[];
  onDelete: () => void;
  onPrimaryRole: (roleId: string) => void;
  onToggleRole: (roleId: string) => void;
}) {
  const assignedRoleIds = useMemo(() => new Set((user.roles || []).map((entry: any) => entry.roleId)), [user.roles]);
  const assignedRoles = roles.filter((role) => assignedRoleIds.has(role.id));

  return (
    <article className="user-card">
      <header>
        <div className="avatar">{initials(user.displayName)}</div>
        <div>
          <strong>{user.displayName}</strong>
          <span>{user.email || 'Pas d’email portail'}</span>
        </div>
        <button className="icon danger-soft" onClick={onDelete} title="Supprimer"><Trash2 size={16} /></button>
      </header>

      <div className="field-row">
        <span>Rôle principal</span>
        <select value={user.primaryRoleId || ''} onChange={(event) => onPrimaryRole(event.target.value)}>
          <option value="">Aucun</option>
          {roles.map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}
        </select>
      </div>

      <div className="role-badges">
        {assignedRoles.length === 0 && <span className="empty-badge">Aucun rôle additionnel</span>}
        {assignedRoles.map((role) => <span className="role-badge" style={{ borderColor: role.color }} key={role.id}>{role.name}</span>)}
      </div>

      <div className="role-picker">
        {roles.map((role) => (
          <label key={role.id} className={assignedRoleIds.has(role.id) ? 'checked' : ''}>
            <input type="checkbox" checked={assignedRoleIds.has(role.id)} onChange={() => onToggleRole(role.id)} />
            <i style={{ background: role.color }} />
            {role.name}
          </label>
        ))}
      </div>
    </article>
  );
}

function initials(name: string) {
  return name.split(' ').filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || 'U';
}

function normalize(kind: string, form: any) {
  if (kind === 'users') {
    return {
      displayName: form.displayName,
      email: form.email || null,
      password: form.password || undefined,
      primaryRoleId: form.primaryRoleId || null,
      roleIds: form.primaryRoleId ? [form.primaryRoleId] : [],
      isActive: true,
      portalEnabled: true
    };
  }
  if (kind === 'roles') return { name: form.name, slug: form.slug, color: form.color || '#60a5fa', sortOrder: Number(form.sortOrder || 0) };
  return { name: form.name, slug: form.slug, type: form.type || 'production', sortOrder: Number(form.sortOrder || 0) };
}

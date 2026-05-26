import { FormEvent, useEffect, useState } from 'react';
import { api } from '../api/client';

export function PresetsLogs() {
  const [presets, setPresets] = useState<any[]>([]);
  const [logs, setLogs] = useState<any[]>([]);
  const [name, setName] = useState('');

  const load = () => {
    api.get('/presets').then((res) => setPresets(res.data));
    api.get('/logs').then((res) => setLogs(res.data));
  };
  useEffect(() => { load(); }, []);

  async function create(event: FormEvent) {
    event.preventDefault();
    await api.post('/presets', { name });
    setName('');
    load();
  }

  return (
    <section className="two-col">
      <div className="panel">
        <form className="inline-form" onSubmit={create}>
          <input placeholder="Nom du preset" value={name} onChange={(e) => setName(e.target.value)} />
          <button>Sauvegarder</button>
        </form>
        {presets.map((preset) => <article className="item-card" key={preset.id}>
          <div><strong>{preset.name}</strong><span>{new Date(preset.createdAt).toLocaleString()}</span></div>
          <button onClick={() => confirm('Appliquer ce preset ?') && api.post(`/presets/${preset.id}/apply`).then(load)}>Appliquer</button>
        </article>)}
      </div>
      <div className="panel log-list">
        {logs.map((log) => <article key={log.id}>
          <strong>{log.action}</strong>
          <span>{log.entity} · {new Date(log.createdAt).toLocaleString()}</span>
        </article>)}
      </div>
    </section>
  );
}

import { useEffect, useState } from 'react';
import { MicOff, VolumeX } from 'lucide-react';
import { api } from '../api/client';
import type { LiveUser, Room } from '../types';

export function LiveIntercom() {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [users, setUsers] = useState<LiveUser[]>([]);

  const load = () => Promise.all([
    api.get('/rooms').then((res) => setRooms(res.data)),
    api.get('/murmur/users').then((res) => setUsers(res.data)).catch(() => setUsers([]))
  ]);
  useEffect(() => { load(); }, []);

  return (
    <section className="room-grid">
      {rooms.map((room) => {
        const present = users.filter((user) => user.channelId === room.murmurChannelId);
        return <article className="room-card" key={room.id}>
          <header><strong>{room.name}</strong><span>{room.type}</span></header>
          {present.length === 0 && <p className="muted">Aucun utilisateur connecté</p>}
          {present.map((user) => <div className="live-user" key={user.session}>
            <span className="dot online" />{user.name}
            <button title="Mute" onClick={() => api.post(`/murmur/users/${user.session}/mute`, { mute: !user.mute }).then(load)}><MicOff size={15} /></button>
            <button title="Deafen" onClick={() => api.post(`/murmur/users/${user.session}/deafen`, { deaf: !user.deaf }).then(load)}><VolumeX size={15} /></button>
          </div>)}
        </article>;
      })}
    </section>
  );
}

import { useEffect, useState } from 'react';
import { api } from '../api/client';
import type { OverrideCell, Permission, Room, User } from '../types';

const permissions: Permission[] = ['inherit', 'none', 'listen', 'talk_ptt', 'duplex', 'admin'];

export function Overrides() {
  const [users, setUsers] = useState<User[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [cells, setCells] = useState<Record<string, Permission>>({});

  useEffect(() => {
    api.get('/overrides').then((res) => {
      setUsers(res.data.users);
      setRooms(res.data.rooms);
      setCells(Object.fromEntries(res.data.cells.map((cell: OverrideCell) => [`${cell.userId}:${cell.roomId}`, cell.permission])));
    });
  }, []);

  async function change(userId: string, roomId: string, permission: Permission) {
    setCells({ ...cells, [`${userId}:${roomId}`]: permission });
    await api.patch('/overrides', { entries: [{ userId, roomId, permission }] });
  }

  return (
    <section className="matrix-wrap">
      <table className="matrix">
        <thead><tr><th>Utilisateur / Salon</th>{rooms.map((room) => <th key={room.id}>{room.name}</th>)}</tr></thead>
        <tbody>
          {users.map((user) => <tr key={user.id}>
            <th>{user.displayName}</th>
            {rooms.map((room) => {
              const value = cells[`${user.id}:${room.id}`] || 'inherit';
              return <td key={room.id} className={`perm-${value}`}>
                <select value={value} onChange={(e) => change(user.id, room.id, e.target.value as Permission)}>
                  {permissions.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              </td>;
            })}
          </tr>)}
        </tbody>
      </table>
    </section>
  );
}

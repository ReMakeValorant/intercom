import { useEffect, useState } from 'react';
import { api } from '../api/client';
import type { MatrixCell, Permission, Role, Room } from '../types';

const permissions: Permission[] = ['inherit', 'none', 'listen', 'talk_ptt', 'duplex', 'admin'];

export function Matrix() {
  const [roles, setRoles] = useState<Role[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [cells, setCells] = useState<Record<string, Permission>>({});

  useEffect(() => {
    api.get('/permissions/matrix').then((res) => {
      setRoles(res.data.roles);
      setRooms(res.data.rooms);
      setCells(Object.fromEntries(res.data.cells.map((cell: MatrixCell) => [`${cell.roleId}:${cell.roomId}`, cell.permission])));
    });
  }, []);

  async function change(roleId: string, roomId: string, permission: Permission) {
    setCells({ ...cells, [`${roleId}:${roomId}`]: permission });
    await api.patch('/permissions/matrix', { entries: [{ roleId, roomId, permission }] });
  }

  return (
    <section className="matrix-wrap">
      <table className="matrix">
        <thead><tr><th>Rôle / Salon</th>{rooms.map((room) => <th key={room.id}>{room.name}</th>)}</tr></thead>
        <tbody>
          {roles.map((role) => <tr key={role.id}>
            <th><span className="badge" style={{ borderColor: role.color }}>{role.name}</span></th>
            {rooms.map((room) => {
              const value = cells[`${role.id}:${room.id}`] || 'inherit';
              return <td key={room.id} className={`perm-${value}`}>
                <select value={value} onChange={(e) => change(role.id, room.id, e.target.value as Permission)}>
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

import type { PermissionLevel } from '@prisma/client';
import { prisma } from '../config/prisma.js';

export const selectablePermissions: PermissionLevel[] = [
  'inherit',
  'none',
  'listen',
  'talk_ptt',
  'duplex',
  'admin',
  'move',
  'mute',
  'deafen',
  'whisper'
];

export class PermissionMatrixService {
  async getRoleMatrix() {
    const [roles, rooms, cells] = await Promise.all([
      prisma.role.findMany({ orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] }),
      prisma.room.findMany({ orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] }),
      prisma.roleRoomPermission.findMany()
    ]);

    return {
      roles,
      rooms,
      cells: cells.map((cell) => ({
        roleId: cell.roleId,
        roomId: cell.roomId,
        permission: cell.permission
      }))
    };
  }

  async patchRoleMatrix(entries: Array<{ roleId: string; roomId: string; permission: PermissionLevel }>) {
    return prisma.$transaction(
      entries.map((entry) =>
        prisma.roleRoomPermission.upsert({
          where: { roleId_roomId: { roleId: entry.roleId, roomId: entry.roomId } },
          update: { permission: entry.permission },
          create: entry
        })
      )
    );
  }

  async getOverrides() {
    const [users, rooms, cells] = await Promise.all([
      prisma.user.findMany({ orderBy: { displayName: 'asc' }, include: { primaryRole: true } }),
      prisma.room.findMany({ orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] }),
      prisma.userPermissionOverride.findMany()
    ]);

    return {
      users,
      rooms,
      cells: cells.map((cell) => ({
        userId: cell.userId,
        roomId: cell.roomId,
        permission: cell.permission,
        reason: cell.reason
      }))
    };
  }

  async patchOverrides(entries: Array<{ userId: string; roomId: string; permission: PermissionLevel; reason?: string }>) {
    return prisma.$transaction(
      entries.map((entry) =>
        prisma.userPermissionOverride.upsert({
          where: { userId_roomId: { userId: entry.userId, roomId: entry.roomId } },
          update: { permission: entry.permission, reason: entry.reason },
          create: entry
        })
      )
    );
  }
}

export const permissionMatrixService = new PermissionMatrixService();

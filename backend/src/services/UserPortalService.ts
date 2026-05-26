import type { PermissionLevel } from '@prisma/client';
import { env } from '../config/env.js';
import { prisma } from '../config/prisma.js';
import { murmurService } from './MurmurService.js';

const rank: Record<PermissionLevel, number> = {
  inherit: 0,
  none: 1,
  listen: 2,
  talk_ptt: 3,
  duplex: 4,
  whisper: 5,
  move: 6,
  mute: 7,
  deafen: 8,
  admin: 9
};

export class UserPortalService {
  async getPortal(userId: string) {
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: userId },
      include: { primaryRole: true, roles: { include: { role: true } }, overrides: true, mumbleAccounts: true }
    });
    const rooms = await prisma.room.findMany({
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: { rolePermissions: true }
    });
    const liveUsers = await murmurService.users().catch(() => []);
    const live = liveUsers.find((liveUser) => liveUser.mumbleUserId === user.mumbleUserId || liveUser.name === user.displayName);
    const roleIds = new Set<string>();
    if (user.primaryRoleId) roleIds.add(user.primaryRoleId);
    user.roles.forEach((entry) => roleIds.add(entry.roleId));

    return {
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        mumbleUserId: user.mumbleUserId,
        primaryRole: user.primaryRole,
        roles: user.roles
      },
      mumble: {
        host: env.MUMBLE_PUBLIC_HOST,
        port: env.MUMBLE_PUBLIC_PORT,
        url: `mumble://${env.MUMBLE_PUBLIC_HOST}:${env.MUMBLE_PUBLIC_PORT}`
      },
      live,
      rooms: rooms.map((room) => {
        const override = user.overrides.find((entry) => entry.roomId === room.id)?.permission;
        const rolePermission = room.rolePermissions
          .filter((entry) => roleIds.has(entry.roleId))
          .map((entry) => entry.permission)
          .sort((a, b) => rank[b] - rank[a])[0] ?? 'inherit';
        const effective = override && override !== 'inherit' ? override : rolePermission;
        return {
          id: room.id,
          name: room.name,
          slug: room.slug,
          type: room.type,
          parentId: room.parentId,
          murmurChannelId: room.murmurChannelId,
          permission: effective,
          canEnter: !['inherit', 'none'].includes(effective)
        };
      })
    };
  }
}

export const userPortalService = new UserPortalService();

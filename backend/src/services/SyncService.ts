import { prisma } from '../config/prisma.js';
import { murmurService } from './MurmurService.js';

export class SyncService {
  async buildSnapshot() {
    const [roles, rooms, rolePermissions, overrides] = await Promise.all([
      prisma.role.findMany(),
      prisma.room.findMany(),
      prisma.roleRoomPermission.findMany(),
      prisma.userPermissionOverride.findMany()
    ]);

    return { roles, rooms, rolePermissions, overrides, generatedAt: new Date().toISOString() };
  }

  async syncToMurmur() {
    const snapshot = await this.buildSnapshot();
    await murmurService.applyAcl(snapshot);
    return snapshot;
  }
}

export const syncService = new SyncService();

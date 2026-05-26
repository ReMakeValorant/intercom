export type Permission = 'inherit' | 'none' | 'listen' | 'talk_ptt' | 'duplex' | 'admin' | 'move' | 'mute' | 'deafen' | 'whisper';

export type Role = { id: string; name: string; slug: string; color: string; sortOrder: number };
export type Room = { id: string; name: string; slug: string; type: string; parentId?: string | null; sortOrder: number; murmurChannelId?: number | null };
export type User = { id: string; displayName: string; mumbleUserId?: number | null; primaryRoleId?: string | null; primaryRole?: Role | null; isActive: boolean };
export type MatrixCell = { roleId: string; roomId: string; permission: Permission };
export type OverrideCell = { userId: string; roomId: string; permission: Permission; reason?: string };
export type LiveUser = { session: number; name: string; channelId: number; mute: boolean; deaf: boolean };

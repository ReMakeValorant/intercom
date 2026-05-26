import { env } from '../config/env.js';

export type LiveMumbleUser = {
  session: number;
  mumbleUserId?: number;
  name: string;
  channelId: number;
  mute: boolean;
  deaf: boolean;
  selfMute?: boolean;
  selfDeaf?: boolean;
};

export type MumbleChannel = {
  id: number;
  parent?: number;
  name: string;
};

export interface MurmurService {
  status(): Promise<{ connected: boolean; mode: string; endpoint: string }>;
  users(): Promise<LiveMumbleUser[]>;
  channels(): Promise<MumbleChannel[]>;
  mute(sessionId: number, mute: boolean): Promise<void>;
  deafen(sessionId: number, deaf: boolean): Promise<void>;
  move(sessionId: number, channelId: number): Promise<void>;
  applyAcl(snapshot: unknown): Promise<void>;
}

export class IceMurmurService implements MurmurService {
  private endpoint = `${env.MURMUR_HOST}:${env.MURMUR_ICE_PORT}`;

  async status() {
    return {
      connected: false,
      mode: 'ice-adapter-placeholder',
      endpoint: this.endpoint
    };
  }

  async users(): Promise<LiveMumbleUser[]> {
    return [];
  }

  async channels(): Promise<MumbleChannel[]> {
    return [];
  }

  async mute(_sessionId: number, _mute: boolean) {
    await this.notImplemented();
  }

  async deafen(_sessionId: number, _deaf: boolean) {
    await this.notImplemented();
  }

  async move(_sessionId: number, _channelId: number) {
    await this.notImplemented();
  }

  async applyAcl(_snapshot: unknown) {
    await this.notImplemented();
  }

  private async notImplemented() {
    throw new Error('Murmur Ice adapter is wired as an abstraction point. Install a Node Ice binding or sidecar and implement IceMurmurService methods.');
  }
}

export const murmurService = new IceMurmurService();

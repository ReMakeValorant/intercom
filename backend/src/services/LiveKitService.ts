import { AccessToken, RoomServiceClient } from 'livekit-server-sdk';
import { env } from '../config/env.js';

export class LiveKitService {
  private roomService?: RoomServiceClient;

  roomName(roomSlug: string) {
    return `intercom-${roomSlug}`;
  }

  serviceUrl() {
    return env.LIVEKIT_URL.replace(/^wss:\/\//, 'https://').replace(/^ws:\/\//, 'http://');
  }

  rooms() {
    if (!this.roomService) {
      this.roomService = new RoomServiceClient(this.serviceUrl(), env.LIVEKIT_API_KEY, env.LIVEKIT_API_SECRET);
    }
    return this.roomService;
  }

  async createJoinToken(input: {
    userId: string;
    displayName: string;
    roomSlug: string;
    canPublish: boolean;
    canSubscribe: boolean;
  }) {
    const token = new AccessToken(env.LIVEKIT_API_KEY, env.LIVEKIT_API_SECRET, {
      identity: input.userId,
      name: input.displayName
    });

    token.addGrant({
      room: this.roomName(input.roomSlug),
      roomJoin: true,
      canPublish: input.canPublish,
      canSubscribe: input.canSubscribe
    });

    return token.toJwt();
  }

  async kickParticipant(roomSlug: string, identity: string) {
    await this.rooms().removeParticipant(this.roomName(roomSlug), identity);
  }
}

export const liveKitService = new LiveKitService();

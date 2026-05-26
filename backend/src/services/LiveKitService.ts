import { AccessToken } from 'livekit-server-sdk';
import { env } from '../config/env.js';

export class LiveKitService {
  roomName(roomSlug: string) {
    return `intercom-${roomSlug}`;
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
}

export const liveKitService = new LiveKitService();

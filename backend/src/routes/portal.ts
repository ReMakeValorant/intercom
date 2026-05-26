import { Router } from 'express';
import { z } from 'zod';
import { requireUser } from '../middleware/auth.js';
import { liveKitService } from '../services/LiveKitService.js';
import { murmurService } from '../services/MurmurService.js';
import { userPortalService } from '../services/UserPortalService.js';
import { env } from '../config/env.js';

export const portalRouter = Router();

portalRouter.use('/portal', requireUser);

portalRouter.get('/portal/me', async (req, res, next) => {
  try {
    res.json(await userPortalService.getPortal(req.user!.id));
  } catch (error) {
    next(error);
  }
});

portalRouter.post('/portal/move', async (req, res, next) => {
  try {
    const body = z.object({ sessionId: z.number().int(), channelId: z.number().int() }).parse(req.body);
    await murmurService.move(body.sessionId, body.channelId);
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

portalRouter.post('/portal/rooms/:roomId/livekit-token', async (req, res, next) => {
  try {
    const portal = await userPortalService.getPortal(req.user!.id);
    const room = portal.rooms.find((entry) => entry.id === req.params.roomId);
    if (!room || !room.canEnter) return res.status(403).json({ message: 'Salon non autorisé' });

    const canPublish = ['talk_ptt', 'duplex', 'admin', 'whisper'].includes(room.permission);
    const token = await liveKitService.createJoinToken({
      userId: portal.user.id,
      displayName: portal.user.displayName,
      roomSlug: room.slug,
      canPublish,
      canSubscribe: true
    });

    res.json({
      token,
      url: env.LIVEKIT_URL,
      roomName: liveKitService.roomName(room.slug),
      canPublish
    });
  } catch (error) {
    next(error);
  }
});

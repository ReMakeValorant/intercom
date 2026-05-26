import { Router } from 'express';
import { env } from '../config/env.js';
import { prisma } from '../config/prisma.js';
import { liveKitService } from '../services/LiveKitService.js';

export const adminIntercomRouter = Router();

adminIntercomRouter.get('/admin-intercom/me', async (req, res, next) => {
  try {
    const rooms = await prisma.room.findMany({ orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] });
    res.json({
      user: {
        id: req.admin!.id,
        displayName: req.admin!.name,
        roles: [{ role: { name: 'Admin' } }]
      },
      livekit: { url: env.LIVEKIT_URL },
      rooms: rooms.map((room) => ({
        id: room.id,
        name: room.name,
        slug: room.slug,
        type: room.type,
        permission: 'admin',
        canEnter: true
      }))
    });
  } catch (error) {
    next(error);
  }
});

adminIntercomRouter.post('/admin-intercom/rooms/:roomId/livekit-token', async (req, res, next) => {
  try {
    const room = await prisma.room.findUniqueOrThrow({ where: { id: req.params.roomId } });
    const token = await liveKitService.createJoinToken({
      userId: `admin-${req.admin!.id}`,
      displayName: req.admin!.name,
      roomSlug: room.slug,
      canPublish: true,
      canSubscribe: true
    });

    res.json({
      token,
      url: env.LIVEKIT_URL,
      roomName: liveKitService.roomName(room.slug),
      canPublish: true
    });
  } catch (error) {
    next(error);
  }
});

adminIntercomRouter.post('/admin-intercom/rooms/:roomId/participants/:identity/kick', async (req, res, next) => {
  try {
    const room = await prisma.room.findUniqueOrThrow({ where: { id: req.params.roomId } });
    if (req.params.identity === `admin-${req.admin!.id}`) return res.status(400).json({ message: 'Impossible de se kicker soi-même' });

    await liveKitService.kickParticipant(room.slug, req.params.identity);
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

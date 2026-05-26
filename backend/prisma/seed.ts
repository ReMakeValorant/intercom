import 'dotenv/config';
import argon2 from 'argon2';
import { PrismaClient, PermissionLevel } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const permissions: Array<{ key: PermissionLevel; label: string; description: string }> = [
    { key: 'inherit', label: 'Hériter', description: 'Utilise la règle du parent ou du rôle' },
    { key: 'none', label: 'Aucun', description: 'Aucun accès au salon' },
    { key: 'listen', label: 'Écoute', description: 'Peut écouter seulement' },
    { key: 'talk_ptt', label: 'PTT', description: 'Peut parler en push-to-talk' },
    { key: 'duplex', label: 'Duplex', description: 'Peut parler et écouter librement' },
    { key: 'admin', label: 'Admin', description: 'Peut gérer le salon' },
    { key: 'move', label: 'Déplacer', description: 'Peut déplacer des utilisateurs' },
    { key: 'mute', label: 'Mute', description: 'Peut couper le micro' },
    { key: 'deafen', label: 'Deafen', description: 'Peut rendre sourd' },
    { key: 'whisper', label: 'Whisper', description: 'Peut utiliser le whisper si supporté' }
  ];

  for (const permission of permissions) {
    await prisma.permission.upsert({
      where: { key: permission.key },
      update: permission,
      create: permission
    });
  }

  const adminPassword = process.env.ADMIN_BOOTSTRAP_PASSWORD || 'ChangeMeNow!123';
  await prisma.adminUser.upsert({
    where: { email: process.env.ADMIN_BOOTSTRAP_EMAIL || 'admin@remakemedia.fr' },
    update: {},
    create: {
      email: process.env.ADMIN_BOOTSTRAP_EMAIL || 'admin@remakemedia.fr',
      name: 'Remake Admin',
      passwordHash: await argon2.hash(adminPassword)
    }
  });

  const producer = await prisma.role.upsert({
    where: { slug: 'production' },
    update: {},
    create: { name: 'Production', slug: 'production', color: '#38bdf8', sortOrder: 10 }
  });
  const tech = await prisma.role.upsert({
    where: { slug: 'technique' },
    update: {},
    create: { name: 'Technique', slug: 'technique', color: '#f59e0b', sortOrder: 20 }
  });

  const regie = await prisma.room.upsert({
    where: { slug: 'regie' },
    update: {},
    create: { name: 'Régie', slug: 'regie', type: 'production', sortOrder: 10, murmurChannelId: 0 }
  });
  const plateau = await prisma.room.upsert({
    where: { slug: 'plateau' },
    update: {},
    create: { name: 'Plateau', slug: 'plateau', type: 'production', sortOrder: 20 }
  });

  await prisma.roleRoomPermission.upsert({
    where: { roleId_roomId: { roleId: producer.id, roomId: regie.id } },
    update: { permission: 'duplex' },
    create: { roleId: producer.id, roomId: regie.id, permission: 'duplex' }
  });
  await prisma.roleRoomPermission.upsert({
    where: { roleId_roomId: { roleId: tech.id, roomId: plateau.id } },
    update: { permission: 'admin' },
    create: { roleId: tech.id, roomId: plateau.id, permission: 'admin' }
  });

  await prisma.user.upsert({
    where: { email: 'user@remakemedia.fr' },
    update: {},
    create: {
      email: 'user@remakemedia.fr',
      displayName: 'Utilisateur demo',
      passwordHash: await argon2.hash('ChangeMeNow!123'),
      primaryRoleId: producer.id,
      portalEnabled: true
    }
  });
}

main().finally(async () => prisma.$disconnect());

import 'dotenv/config';
import argon2 from 'argon2';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const email = process.argv[2] || process.env.ADMIN_EMAIL;
  const password = process.argv[3] || process.env.ADMIN_PASSWORD;

  if (!email || !password || password.length < 8) {
    console.error('Usage: npm run admin:password -- admin@remakemedia.fr NouveauMotDePasseFort');
    console.error('Le mot de passe doit faire au moins 8 caractères.');
    process.exit(1);
  }

  const admin = await prisma.adminUser.update({
    where: { email },
    data: { passwordHash: await argon2.hash(password) }
  });

  console.log(`Mot de passe admin mis à jour pour ${admin.email}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => prisma.$disconnect());

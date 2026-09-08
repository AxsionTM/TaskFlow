/**
 * Выдача прав администратора существующему пользователю:
 *   npx tsx scripts/promote-admin.ts admin@example.com
 * Снятие прав: npx tsx scripts/promote-admin.ts user@example.com --demote
 */
import { prisma } from '../src/common/utils/prisma';

async function main() {
  const email = (process.argv[2] || '').trim().toLowerCase();
  const demote = process.argv.includes('--demote');
  if (!email) {
    console.error('Usage: npx tsx scripts/promote-admin.ts <email> [--demote]');
    process.exit(1);
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    console.error(`User not found: ${email}`);
    process.exit(1);
  }

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { role: demote ? 'USER' : 'ADMIN' },
  });

  console.log(`OK: ${updated.email} role=${updated.role}`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

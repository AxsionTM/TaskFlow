// Unit-тест choice-flow rule-движка: кандидаты → порядковый выбор.
// Запуск: DATABASE_URL=... tsx scripts/test-choice.mjs
import { prisma } from '../src/common/utils/prisma.ts';
import { runRuleTurn } from '../src/modules/agent/engine.ts';

let pass = 0;
let fail = 0;
function check(name, cond, extra) {
  if (cond) {
    pass++;
    console.log(`OK   ${name}`);
  } else {
    fail++;
    console.log(`FAIL ${name} ${extra !== undefined ? JSON.stringify(extra)?.slice(0, 300) : ''}`);
  }
}

const email = `choice-${Date.now()}@test.com`;
const user = await prisma.user.create({
  data: { email, passwordHash: 'x', name: 'C', emailVerified: true },
});
const mk = (title) =>
  prisma.task.create({ data: { title, creatorId: user.id, status: 'TODO' } });
await mk('Отчет май');
await mk('Отчет июнь');
await mk('Отчет июль');

const ctx = { tz: 'UTC', lastTaskId: null, lastTaskTitle: null, pendingChoice: null };
const r1 = await runRuleTurn(user.id, 'Найди отчет', ctx, new Date());
check('options returned', (r1.options || []).length >= 2, r1);
// routes.ts сохраняет options в context.pendingChoice:
ctx.pendingChoice = { candidates: (r1.options || []).map((o) => ({ id: o.key, title: o.label, sub: o.sub })) };
const r2 = await runRuleTurn(user.id, 'вторую', ctx, new Date());
check('ordinal resolves 2nd', /Отчет июнь/.test(r2.reply || ''), r2.reply?.slice(0, 200));

await prisma.task.deleteMany({ where: { creatorId: user.id } }).catch(() => {});
await prisma.user.delete({ where: { id: user.id } }).catch(() => {});
await prisma.$disconnect();
console.log(`RESULT pass=${pass} fail=${fail}`);
process.exit(fail ? 1 : 0);

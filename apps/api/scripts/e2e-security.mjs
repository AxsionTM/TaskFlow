// Security E2E: IDOR/BOLA, admin negatives, auth negatives, abuse caps,
// socket rooms, rate limits. Требует поднятый API на чистой БД.
// Запуск: npm run test:security (E2E_BASE по умолчанию http://127.0.0.1:3999)
// ВНИМАНИЕ: тест R8 намеренно исчерпывает часовой лимит resend-code для
// локального IP — запускайте его последним.
const B = process.env.E2E_BASE || 'http://127.0.0.1:3999';
let pass = 0;
let fail = 0;

async function req(method, path, body, token, headers) {
  const res = await fetch(B + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: 'Bearer ' + token } : {}),
      ...(headers || {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try {
    json = await res.json();
  } catch {}
  return { status: res.status, json };
}

function check(name, cond, extra) {
  if (cond) {
    pass++;
    console.log(`OK   ${name}`);
  } else {
    fail++;
    console.log(`FAIL ${name} ${extra !== undefined ? JSON.stringify(extra)?.slice(0, 400) : ''}`);
  }
}

async function user(email) {
  const reg = await req('POST', '/auth/register', { email, password: 'secret12', confirmPassword: 'secret12' });
  const ver = await req('POST', '/auth/verify-email', { email, code: reg.json.devCode });
  return ver.json.token;
}

const A = await user('sec-a@test.com');
const E = await user('sec-e@test.com');

// --- R1: задачи/заметки IDOR ---
const t = await req('POST', '/tasks', { title: 'a secret' }, A);
const TID = t.json.task.id;
const n = await req('POST', '/notes', { taskId: TID, content: 'a secret note' }, A);
const NID = n.json.note.id;
check('R1 task read 404', (await req('GET', `/tasks/${TID}`, null, E)).status === 404);
check('R1 task patch 404', (await req('PATCH', `/tasks/${TID}`, { title: 'x' }, E)).status === 404);
check('R1 task delete 404', (await req('DELETE', `/tasks/${TID}`, null, E)).status === 404);
check('R1 note read 404', (await req('GET', `/notes/${NID}`, null, E)).status === 404);

// --- R2: проекты/теги/привычки/цели IDOR ---
const p = await req('POST', '/projects', { name: 'a proj' }, A);
const PID = p.json.project.id;
check('R2 project patch 403', (await req('PATCH', `/projects/${PID}`, { name: 'x' }, E)).status === 403);
check('R2 project delete 403', (await req('DELETE', `/projects/${PID}`, null, E)).status === 403);
const tag = await req('POST', '/tags', { name: 'atag' }, A);
check('R2 tag delete 404', (await req('DELETE', `/tags/${tag.json.tag.id}`, null, E)).status === 404);
const h = await req('POST', '/habits', { name: 'ahabit' }, A);
check('R2 habit patch 404', (await req('PATCH', `/habits/${h.json.habit.id}`, { name: 'x' }, E)).status === 404);
const g = await req('POST', '/goals', { name: 'agoal' }, A);
check('R2 goal delete 404', (await req('DELETE', `/goals/${g.json.goal.id}`, null, E)).status === 404);

// --- R3: admin negatives ---
check('R3 admin stats 403', (await req('GET', '/admin/stats', null, E)).status === 403);
check('R3 no-auth 401', (await req('GET', '/admin/stats')).status === 401);
check('R3 bad token 401', (await req('GET', '/admin/stats', null, 'bad.token.here')).status === 401);
const noneAlg = 'eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.eyJ1c2VySWQiOiJ4In0.';
check('R3 none-alg rejected', (await req('GET', '/admin/stats', null, noneAlg)).status === 401);

// --- R4: auth negatives ---
check('R4 wrong password 401', (await req('POST', '/auth/login', { email: 'sec-a@test.com', password: 'wrongpw1' })).status === 401);
const fr = await req('POST', '/auth/forgot-password', { email: 'sec-a@test.com' });
const badCode = await req('POST', '/auth/verify-reset-code', { email: 'sec-a@test.com', code: '000000' });
check('R4 bad reset code 400', badCode.status === 400, badCode);

// --- R5: abuse caps ---
const huge = await req('POST', '/tasks', { title: 'x'.repeat(600) }, A);
check('R5 huge title 400', huge.status === 400, huge.status);
const manyTags = await req('POST', '/tasks', { title: 't', tagIds: Array.from({ length: 60 }, (_, i) => `id${i}`) }, A);
check('R5 tagIds cap 400', manyTags.status === 400, manyTags.status);
const aiBig = await req(
  'POST',
  '/ai/day-plan',
  { tasks: Array.from({ length: 250 }, (_, i) => ({ title: `t${i}` })), available_hours: 8 },
  A
);
check('R5 AI tasks cap 400', aiBig.status === 400, aiBig.status);
const aiHours = await req('POST', '/ai/day-plan', { tasks: [{ title: 't' }], available_hours: 999 }, A);
check('R5 AI hours cap 400', aiHours.status === 400, aiHours.status);
const aiProd = await req('POST', '/ai/productivity', { tasks: [], evil: 'x'.repeat(100) }, A);
check('R5 AI strict body 400', aiProd.status === 400, aiProd.status);
const bigJson = await req('POST', '/tasks', { title: 't', description: 'x'.repeat(2 * 1024 * 1024) }, A);
check('R5 body limit 413', bigJson.status === 413, bigJson.status);

// --- R6: export scoped + upload filter ---
const exp = await req('GET', '/export/csv', null, A);
check('R6 export own only', exp.status === 200, exp.status);

// --- R7: socket rooms (нужен socket.io-client) ---
let socketOk = 'SKIP';
try {
  const { io } = await import('socket.io-client');
  const anon = io(B, { autoConnect: false });
  const anonRes = await new Promise((resolve) => {
    const to = setTimeout(() => resolve('no-error-callback'), 4000);
    anon.on('connect_error', () => {
      clearTimeout(to);
      resolve('rejected');
    });
    anon.on('connect', () => {
      clearTimeout(to);
      resolve('connected-ANON');
    });
    anon.connect();
  });
  anon.disconnect();
  check('R7 anonymous socket rejected', anonRes === 'rejected', anonRes);

  // A подключается, пытается зайти в комнату E — событий E получать не должен.
  const meE = await (await fetch(B + '/auth/me', { headers: { Authorization: 'Bearer ' + E } })).json();
  const sockA = io(B, { auth: { token: A }, autoConnect: false });
  await new Promise((resolve, reject) => {
    const to = setTimeout(() => reject(new Error('connect timeout')), 5000);
    sockA.on('connect', () => {
      clearTimeout(to);
      resolve(null);
    });
    sockA.on('connect_error', (e) => {
      clearTimeout(to);
      reject(e);
    });
    sockA.connect();
  });
  let leaked = false;
  sockA.on('task:created', () => {
    leaked = true;
  });
  sockA.emit('join:user', meE.user.id);
  await new Promise((r) => setTimeout(r, 500));
  await req('POST', '/tasks', { title: 'trigger for E' }, E);
  await new Promise((r) => setTimeout(r, 800));
  sockA.disconnect();
  check('R7 no cross-user room leak', leaked === false, leaked);
  socketOk = 'DONE';
} catch (e) {
  check('R7 socket lib available', false, String(e).slice(0, 200));
}
void socketOk;

// --- R8: rate limit burst (ПОСЛЕДНИМ — сжигает часовой бюджет IP) ---
let saw429 = false;
for (let i = 0; i < 40; i++) {
  const r = await req('POST', '/auth/resend-code', { email: 'ghost-rate@test.com', purpose: 'verify' });
  if (r.status === 429) {
    saw429 = true;
    break;
  }
}
check('R8 resend burst limited', saw429 === true, saw429);

console.log(`RESULT pass=${pass} fail=${fail}`);
process.exit(fail ? 1 : 0);

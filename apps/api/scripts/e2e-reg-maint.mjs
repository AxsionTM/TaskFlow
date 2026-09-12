// E2E: anti-bot регистрация (pending-flow), maintenance-bypass, уведомления.
// Требует поднятый API. RegisterLimiter 10/ч и codeLimiter 30/ч на IP —
// скрипт укладывается (~15 code-хитов), запускать на чистой БД.
// Запуск: npm run test:regmaint (E2E_BASE по умолчанию http://127.0.0.1:3999).
// Сервер поднимать с REG_MIN_VERIFY_DELAY_SEC=0 (иначе мгновенный verify
// отклоняется anti-bot задержкой — так и задумано для продакшена).
const B = process.env.E2E_BASE || 'http://127.0.0.1:3999';
let pass = 0;
let fail = 0;

async function req(method, path, body, token) {
  const res = await fetch(B + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: 'Bearer ' + token } : {}),
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

// --- REGISTRATION: normal flow, user создан ТОЛЬКО после verify ---
const reg = await req('POST', '/auth/register', { email: 'pend@test.com', password: 'secret12', confirmPassword: 'secret12', name: 'Pend' });
check('1 normal registration → pending', reg.status === 201 && reg.json.requiresVerification === true, reg);
const preLogin = await req('POST', '/auth/login', { email: 'pend@test.com', password: 'secret12' });
check('no User before verify (login 401)', preLogin.status === 401, preLogin);
const ver = await req('POST', '/auth/verify-email', { email: 'pend@test.com', code: reg.json.devCode });
check('verify creates user + token', ver.status === 200 && ver.json.token && ver.json.user.emailVerified === true, ver.status);
const postLogin = await req('POST', '/auth/login', { email: 'pend@test.com', password: 'secret12' });
check('login after verify', postLogin.status === 200, postLogin.status);

// --- wrong/expired codes (используем verify-лимит аккуратно) ---
const badCode = await req('POST', '/auth/verify-reset-code', { email: 'pend@test.com', code: '000000' });
check('8 wrong code rejected', badCode.status === 400, badCode);

// --- MAINTENANCE: fake/expired/blocked JWT не дают bypass ---
const adminLogin = await req('POST', '/auth/login', { email: 'owner2@test.com', password: 'secret12' });
const A = adminLogin.json.token;
await req('POST', '/admin/system/maintenance', { enabled: true, message: 't' }, A);
const fakeJwt = 'eyJhbGciOiJIUzI1NiJ9.eyJ1c2VySWQiOiJmYWtlLXJvbGUtYWRtaW4ifQ.invalidsignature00000000000000000000';
check('15 fake JWT no bypass', (await req('GET', '/tasks', null, fakeJwt)).status === 401);
const noneJwt = 'eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.eyJ1c2VySWQiOiJ4In0.';
check('15 none-alg no bypass', (await req('GET', '/tasks', null, noneJwt)).status === 401);
// blocked admin: блокируем owner2 вторым путём? Нельзя (self-block запрещён).
// Вместо этого: обычный токен при maintenance → 503 (уже покрыто), админ → 200:
check('14 admin works during maintenance', (await req('GET', '/admin/stats', null, A)).status === 200);
check('12 user tasks 503', (await req('GET', '/tasks', null, postLogin.json.token)).status === 503);
check('12 user notifications 503', (await req('GET', '/notifications', null, postLogin.json.token)).status === 503);
check('12 user tags 503', (await req('GET', '/tags', null, postLogin.json.token)).status === 503);
// 17: expired JWT — подделываем через короткоживущий? Проверяем чужой мусор:
check('17 garbage token 401', (await req('GET', '/tasks', null, 'garbage')).status === 401);
await req('POST', '/admin/system/maintenance', { enabled: false }, A);
check('11 maintenance off → app works', (await req('GET', '/tasks', null, postLogin.json.token)).status === 200);

// --- NOTIFICATIONS: user-specific + IDOR ---
const sndAll = await req('POST', '/admin/notifications', { title: 'All', message: 'for all', all: true }, A);
check('18 broadcast saved', sndAll.status === 200 && sndAll.json.recipients >= 1, sndAll);
const uCnt = await req('GET', '/notifications/unread-count', null, postLogin.json.token);
check('19 all-users received', uCnt.status === 200 && uCnt.json.count >= 1, uCnt);
// user-specific: создаём второго юзера и шлём только ему
const reg2 = await req('POST', '/auth/register', { email: 'only@test.com', password: 'secret12', confirmPassword: 'secret12' });
const ver2 = await req('POST', '/auth/verify-email', { email: 'only@test.com', code: reg2.json.devCode });
const me2 = await req('GET', '/auth/me', null, ver2.json.token);
await req('POST', '/auth/login', { email: 'pend@test.com', password: 'secret12' });
const me1 = await req('GET', '/auth/me', null, postLogin.json.token);
const direct = await req('POST', '/admin/notifications', { title: 'Direct', message: 'only you', userIds: [me2.json.user.id] }, A);
check('targeted send', direct.status === 200 && direct.json.recipients === 1, direct);
const c2 = await req('GET', '/notifications/unread-count', null, ver2.json.token);
const c1 = await req('GET', '/notifications', null, postLogin.json.token);
check('20 only target sees it', c2.status === 200 && c2.json.count >= 1 && !c1.json.notifications.some((n) => n.title === 'Direct'), { c2, n: c1.json.notifications.length });
const others = await req('GET', '/notifications', null, ver2.json.token);
const foreignId = c1.json.notifications[0]?.id;
const idor = foreignId ? await req('PATCH', `/notifications/${foreignId}/read`, {}, ver2.json.token) : { status: 0 };
check('21 foreign notification 404', !foreignId || idor.status === 404, idor);
void others;

// --- 9: удалённый email регистрируется заново (через admin delete) ---
const victim = await req('POST', '/admin/users', { email: 'gone@test.com', password: 'secret12' }, A);
check('admin create for delete-test', victim.status === 201, victim.status);
check('admin delete', (await req('DELETE', `/admin/users/${victim.json.user.id}`, null, A)).status === 200);
const reReg = await req('POST', '/auth/register', { email: 'gone@test.com', password: 'secret12', confirmPassword: 'secret12' });
check('9 deleted email re-registers', reReg.status === 201 && reReg.json.requiresVerification === true, reReg);
const reVer = await req('POST', '/auth/verify-email', { email: 'gone@test.com', code: reReg.json.devCode });
check('9 re-registered activates', reVer.status === 200, reVer.status);

// --- 5/10: register rate limit (ПОСЛЕДНИМ — сжигает бюджет IP) ---
let saw429 = false;
for (let i = 0; i < 14; i++) {
  const r = await req('POST', '/auth/register', { email: `spam${i}@test.com`, password: 'secret12', confirmPassword: 'secret12' });
  if (r.status === 429) {
    saw429 = true;
    break;
  }
}
check('5/10 register burst limited', saw429 === true, saw429);

console.log(`RESULT pass=${pass} fail=${fail}`);
process.exit(fail ? 1 : 0);

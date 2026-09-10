// Полный E2E новой админки. Требует поднятый API и ADMIN-аккаунт owner2@test.com
// (создать: регистрация + verify + scripts/promote-admin.ts).
// Запуск: npm run test:admin (E2E_BASE по умолчанию http://127.0.0.1:3999)
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

// --- admin login ---
const login = await req('POST', '/auth/login', { email: 'owner2@test.com', password: 'secret12' });
check('admin login role ADMIN', login.status === 200 && login.json.user.role === 'ADMIN', login);
const A = login.json.token;
const ADMIN_ID = login.json.user.id;

// --- dashboard stats (без монетизации в UI, но endpoint отдаёт реальные данные) ---
const stats = await req('GET', '/admin/stats', null, A);
check('stats totals', stats.status === 200 && stats.json.totalUsers >= 1 && typeof stats.json.totalTasks === 'number', stats.json);

// --- create user via admin ---
const cu = await req('POST', '/admin/users', { email: 'victim@test.com', password: 'secret12', name: 'Victim' }, A);
check('admin create user', cu.status === 201 && cu.json.user.emailVerified !== false, cu);
const VID = cu.json.user.id;

// --- user login + task create (регресс) ---
const vu = await req('POST', '/auth/login', { email: 'victim@test.com', password: 'secret12' });
check('created user can login', vu.status === 200, vu);
const U = vu.json.token;
const task = await req('POST', '/tasks', { title: 'victim task one' }, U);
check('user creates task', task.status === 201 && task.json.task.id, task);
const TID = task.json.task.id;

// --- admin tasks search/filter ---
const ts = await req('GET', `/admin/tasks?search=victim&userId=${VID}`, null, A);
check('admin tasks search', ts.status === 200 && ts.json.total >= 1, ts.json);
const tu = await req('PATCH', `/admin/tasks/${TID}`, { title: 'renamed by admin', status: 'IN_PROGRESS', priority: 'HIGH' }, A);
check('admin task update', tu.status === 200 && tu.json.task.title === 'renamed by admin', tu);

// --- global search (задача к этому моменту переименована в renamed by admin) ---
const gs = await req('GET', '/admin/search?q=renamed', null, A);
check('global search', gs.status === 200 && gs.json.tasks.length >= 1, gs.json);
const gs2 = await req('GET', '/admin/search?q=victim', null, A);
check('global search users', gs2.status === 200 && gs2.json.users.length >= 1, gs2.json);

// --- impersonate log ---
const imp = await req('POST', `/admin/users/${VID}/impersonate`, {}, A);
check('impersonate logged', imp.status === 200 && imp.json.ok, imp);

// --- password change invalidates old token ---
const pw = await req('POST', `/admin/users/${VID}/password`, { password: 'newpass99', confirmPassword: 'newpass99' }, A);
check('admin password change', pw.status === 200, pw);
const oldTok = await req('GET', '/tasks', null, U);
check('old token dead after password change', oldTok.status === 401, oldTok);
const vu2 = await req('POST', '/auth/login', { email: 'victim@test.com', password: 'newpass99' });
check('login with new password', vu2.status === 200, vu2);
const vuOld = await req('POST', '/auth/login', { email: 'victim@test.com', password: 'secret12' });
check('old password rejected', vuOld.status === 401, vuOld);

// --- delete task ---
const dt = await req('DELETE', `/admin/tasks/${TID}`, null, A);
check('admin task delete', dt.status === 200, dt);

// --- delete user + re-register same email ---
const du = await req('DELETE', `/admin/users/${VID}`, null, A);
check('admin user delete', du.status === 200, du);
const me = await req('GET', '/auth/me', null, vu2.json.token);
check('deleted user token dead', me.status === 401, me);
const re = await req('POST', '/auth/register', { email: 'victim@test.com', password: 'secret12', confirmPassword: 'secret12' });
check('re-register deleted email', re.status === 201 && re.json.requiresVerification === true, re);

// --- USER cannot touch admin ---
const ru = await req('POST', '/auth/register', { email: 'plain@test.com', password: 'secret12', confirmPassword: 'secret12' });
const pu = await req('POST', '/auth/verify-email', { email: 'plain@test.com', code: ru.json.devCode });
const P = pu.json.token;
const neg1 = await req('GET', '/admin/stats', null, P);
check('USER stats 403', neg1.status === 403, neg1);
const neg2 = await req('POST', `/admin/users/${ADMIN_ID}/password`, { password: 'x1234567', confirmPassword: 'x1234567' }, P);
check('USER password change 403', neg2.status === 403, neg2);
const neg3 = await req('DELETE', `/admin/users/${ADMIN_ID}`, null, P);
check('USER delete 403', neg3.status === 403, neg3);
const neg4 = await req('GET', '/admin/errors', null, P);
check('USER errors 403', neg4.status === 403, neg4);
const neg5 = await req('GET', '/admin/logs', null);
check('no-auth logs 401', neg5.status === 401, neg5);

// --- errors list (may be empty) ---
const errs = await req('GET', '/admin/errors', null, A);
check('errors list', errs.status === 200 && Array.isArray(errs.json.errors), errs.json);

// --- notifications ---
const nt = await req('POST', '/admin/notifications', { title: 'E2E works', message: 'hello', all: true }, A);
check('broadcast send', nt.status === 200 && nt.json.recipients >= 1, nt);
const nh = await req('GET', '/admin/notifications?pageSize=5', null, A);
check('broadcast history', nh.status === 200 && nh.json.broadcasts.length >= 1, nh.json);

// --- feature flags ---
const fl = await req('GET', '/admin/feature-flags', null, A);
check('flags list has AI_ASSISTANT', fl.status === 200 && fl.json.flags.some((f) => f.key === 'AI_ASSISTANT'), fl.json);
const flOff = await req('PUT', '/admin/feature-flags/AI_ASSISTANT', { enabled: false }, A);
check('flag off', flOff.status === 200 && flOff.json.flag.enabled === false, flOff);
const aiBlocked = await req('POST', '/ai/priority', { title: 'test' }, A);
check('AI blocked when flag off', aiBlocked.status === 403, aiBlocked);
await req('PUT', '/admin/feature-flags/AI_ASSISTANT', { enabled: true }, A);
const aiOn = await req('POST', '/ai/priority', { title: 'test' }, A);
check('AI works when flag on', aiOn.status === 200, aiOn);

// --- maintenance ---
const mOn = await req('POST', '/admin/system/maintenance', { enabled: true, message: 'E2E maintenance' }, A);
check('maintenance on', mOn.status === 200, mOn);
const blocked = await req('GET', '/tasks', null, P);
check('user blocked by maintenance', blocked.status === 503 && blocked.json?.error?.code === 'MAINTENANCE', blocked);
const adminPass = await req('GET', '/admin/stats', null, A);
check('admin passes during maintenance', adminPass.status === 200, adminPass.status);
const pub = await req('GET', '/auth/system/status');
check('public status shows maintenance', pub.status === 200 && pub.json.maintenance.enabled === true, pub.json);
await req('POST', '/admin/system/maintenance', { enabled: false }, A);
const after = await req('GET', '/tasks', null, P);
check('user works after maintenance off', after.status === 200, after);

// --- audit log has entries ---
const logs = await req('GET', '/admin/logs?pageSize=50', null, A);
const actions = (logs.json.logs || []).map((l) => l.action);
for (const a of ['USER_CREATE', 'USER_DELETE', 'USER_PASSWORD_CHANGED', 'TASK_UPDATE', 'TASK_DELETE', 'IMPERSONATE', 'NOTIFICATION_SEND', 'FLAG_DISABLE', 'MAINTENANCE_ENABLE', 'ADMIN_LOGIN']) {
  check(`audit has ${a}`, actions.includes(a), actions.slice(0, 20));
}

console.log(`RESULT pass=${pass} fail=${fail}`);
process.exit(fail ? 1 : 0);

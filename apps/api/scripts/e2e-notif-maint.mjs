// E2E сценарии: уведомления (admin→user→read→history) и maintenance
// (on/off, bypass админа, публичный статус, USER не может переключать).
// Требует поднятый API и ADMIN-аккаунт owner2@test.com.
// Запуск: npm run test:notifmaint (E2E_BASE по умолчанию http://127.0.0.1:3999)
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
  return { status: res.status, json, headers: res.headers };
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

const login = await req('POST', '/auth/login', { email: 'owner2@test.com', password: 'secret12' });
check('admin login', login.status === 200 && login.json.user.role === 'ADMIN', login);
const A = login.json.token;
const U = await user('notify-user@test.com');

// Сценарий 1: broadcast всем → пользователь видит
const snd = await req('POST', '/admin/notifications', { title: 'Технические работы', message: 'Сегодня с 02:00 до 02:30 будут проводиться работы.', all: true }, A);
check('S1 broadcast sent', snd.status === 200 && snd.json.recipients >= 1, snd);
const cnt1 = await req('GET', '/notifications/unread-count', null, U);
check('S1 unread count 1', cnt1.status === 200 && cnt1.json.count === 1, cnt1);
const list1 = await req('GET', '/notifications', null, U);
check('S1 user sees notification', list1.status === 200 && list1.json.notifications.length === 1 && list1.json.notifications[0].title === 'Технические работы', list1.json);
const NID = list1.json.notifications[0].id;

// Прочитано → больше не новое
await req('PATCH', `/notifications/${NID}/read`, {}, U);
const cnt2 = await req('GET', '/notifications/unread-count', null, U);
check('read clears unread', cnt2.status === 200 && cnt2.json.count === 0, cnt2);
const snd2 = await req('POST', '/admin/notifications', { title: 'Новость', message: 'Текст новости', all: true }, A);
check('second broadcast', snd2.status === 200, snd2);
await req('POST', '/notifications/read-all', {}, U);
const cnt3 = await req('GET', '/notifications/unread-count', null, U);
check('read-all clears unread', cnt3.status === 200 && cnt3.json.count === 0, cnt3);

// Чужие уведомления недоступны
const U2 = await user('notify-user2@test.com');
const foreign = await req('PATCH', `/notifications/${NID}/read`, {}, U2);
check('foreign notification blocked', foreign.status === 404, foreign);

// Сценарий 2: история в админке переживает refresh (второй запрос)
const h1 = await req('GET', '/admin/notifications?pageSize=10', null, A);
const h2 = await req('GET', '/admin/notifications?pageSize=10', null, A);
check(
  'S2 history persistent with recipients',
  h1.status === 200 && h2.status === 200 &&
    h1.json.broadcasts.length >= 2 &&
    h1.json.broadcasts.every((b) => b.title && b.message && typeof b.recipients === 'number' && b.createdAt),
  h1.json
);

// Сценарий 3-5: maintenance on → 503 у юзера, off → 200
const mOn = await req('POST', '/admin/system/maintenance', { enabled: true, message: 'Сегодня с 02:00 до 02:30 будут проводиться технические работы.' }, A);
check('S3 maintenance on', mOn.status === 200, mOn);
const blocked = await req('GET', '/tasks', null, U);
check('S3 user gets 503 with message', blocked.status === 503 && blocked.json?.error?.code === 'MAINTENANCE' && blocked.json?.error?.message?.includes('02:00'), blocked);
const pub = await req('GET', '/auth/system/status');
check('public status no-store + enabled', pub.status === 200 && pub.json.maintenance.enabled === true && (pub.headers.get('cache-control') || '').includes('no-store'), { status: pub.status, cc: pub.headers.get('cache-control'), body: pub.json });
const blocked2 = await req('GET', '/tasks', null, U);
check('S4 still blocked after refresh', blocked2.status === 503, blocked2.status);
const mOff = await req('POST', '/admin/system/maintenance', { enabled: false }, A);
check('S5 maintenance off', mOff.status === 200, mOff);
const works = await req('GET', '/tasks', null, U);
check('S5 user works again', works.status === 200, works.status);

// Сценарий 6: админ имеет доступ при включённом режиме
await req('POST', '/admin/system/maintenance', { enabled: true, message: 'check' }, A);
const adminOk = await req('GET', '/admin/stats', null, A);
check('S6 admin bypass', adminOk.status === 200, adminOk.status);
await req('POST', '/admin/system/maintenance', { enabled: false }, A);

// Сценарий 7: USER не может трогать maintenance/уведомления
check('S7 user cannot enable maintenance', (await req('POST', '/admin/system/maintenance', { enabled: true }, U)).status === 403);
check('S7 user cannot broadcast', (await req('POST', '/admin/notifications', { title: 'x', message: 'y', all: true }, U)).status === 403);
check('S7 user cannot read admin history', (await req('GET', '/admin/notifications', null, U)).status === 403);

console.log(`RESULT pass=${pass} fail=${fail}`);
process.exit(fail ? 1 : 0);

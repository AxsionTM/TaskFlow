// E2E push: vapid-key auth, subscribe validation, dispatch auth.
// Requires running API. Usage: npm run test:push (E2E_BASE default http://127.0.0.1:3999)
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
    console.log(`FAIL ${name} ${extra !== undefined ? JSON.stringify(extra)?.slice(0, 300) : ''}`);
  }
}

async function user(email) {
  const reg = await req('POST', '/auth/register', { email, password: 'secret12', confirmPassword: 'secret12' });
  const ver = await req('POST', '/auth/verify-email', { email, code: reg.json.devCode });
  return ver.json.token;
}

const T = await user('push-a@test.com');

// 1. vapid-key requires auth
const anon = await req('GET', '/push/vapid-key');
check('vapid-key 401 anon', anon.status === 401, anon.status);

// 2. vapid-key shape (key may be null without env)
const vk = await req('GET', '/push/vapid-key', null, T);
check('vapid-key shape', vk.status === 200 && 'pushReady' in (vk.json || {}), vk.json);

// 3. subscribe validation
const bad = await req('POST', '/push/subscribe', { endpoint: 'x' }, T);
check('subscribe 400 bad', bad.status === 400, bad.status);

// 4. subscribe without VAPID configured -> 500 (or 201 if env has keys)
const sub = await req(
  'POST',
  '/push/subscribe',
  { endpoint: 'https://example.com/push/abc123', p256dh: 'k1', auth: 'k2' },
  T
);
check(
  'subscribe no-vapid 500 or ok',
  sub.status === 500 || sub.status === 201,
  sub.status
);

// 5. unsubscribe always ok (idempotent)
const un = await req('POST', '/push/unsubscribe', { endpoint: 'https://example.com/push/abc123' }, T);
check('unsubscribe ok', un.status === 200, un.status);

// 6. dispatch without secret -> 401 (or 500 if CRON_SECRET unset — both mean "not open")
const d0 = await req('GET', '/cron/dispatch');
check('dispatch closed', d0.status === 401 || d0.status === 500, d0.status);

// 7. dispatch with wrong secret -> 401/500
const d1 = await req('GET', '/cron/dispatch?key=wrong', null, null, { Authorization: 'Bearer wrong' });
check('dispatch wrong secret', d1.status === 401 || d1.status === 500, d1.status);

console.log(`RESULT pass=${pass} fail=${fail}`);
process.exit(fail ? 1 : 0);

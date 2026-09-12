// E2E recurrence: validation, /recurring list, skip-occurrence.
// Requires running API on a clean test DB.
// Usage: npm run test:recurrence (E2E_BASE default http://127.0.0.1:3999)
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

async function user(email) {
  const reg = await req('POST', '/auth/register', { email, password: 'secret12', confirmPassword: 'secret12' });
  const ver = await req('POST', '/auth/verify-email', { email, code: reg.json.devCode });
  return ver.json.token;
}

const A = await user('recur-a@test.com');
const E = await user('recur-e@test.com');

const pad = (n) => String(n).padStart(2, '0');
const key = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const anchor = new Date();
anchor.setDate(anchor.getDate() + 1);
const end = new Date(anchor);
end.setDate(end.getDate() + 4);
const iso = (d, h, m) => {
  const c = new Date(d);
  c.setHours(h, m || 0, 0, 0);
  return c.toISOString();
};

// 1. create daily recurring 16:00-18:00 with end
const created = await req(
  'POST',
  '/tasks',
  {
    title: 'Daily gym',
    startDate: iso(anchor, 16),
    dueDate: iso(anchor, 18),
    recurrenceType: 'DAILY',
    recurrenceRule: { interval: 1, end: key(end) },
  },
  A
);
check('create recurring', created.status === 201 && created.json.task.recurrenceType === 'DAILY', created);
const TID = created.json.task.id;

// 2. invalid rule rejected (bad end date)
const bad = await req(
  'POST',
  '/tasks',
  { title: 'Bad rule', recurrenceType: 'DAILY', recurrenceRule: { interval: 1, end: 'not-a-date' } },
  A
);
check('bad end date rejected', bad.status === 400, bad);

// 3. interval clamped (object form normalized)
const clamped = await req('PATCH', `/tasks/${TID}`, { recurrenceRule: { interval: 99, end: key(end) } }, A);
check('interval clamped', clamped.status === 200 && JSON.parse(clamped.json.task.recurrenceRule).interval === 30, clamped.json.task?.recurrenceRule);

// restore sane rule
await req('PATCH', `/tasks/${TID}`, { recurrenceRule: { interval: 1, end: key(end) } }, A);

// 4. /recurring lists it
const list = await req('GET', '/tasks/recurring', null, A);
check('recurring listed', list.status === 200 && list.json.tasks.some((t) => t.id === TID), list.json.tasks?.length);

// 5. skip-occurrence persists
const skipDate = key(new Date(anchor.getTime() + 86400000));
const sk = await req('POST', `/tasks/${TID}/skip-occurrence`, { date: skipDate }, A);
check('skip ok', sk.status === 200, sk);
const after = await req('GET', `/tasks/${TID}`, null, A);
const rule = JSON.parse(after.json.task.recurrenceRule || '{}');
check('skip stored', Array.isArray(rule.skip) && rule.skip.includes(skipDate), rule);

// 6. foreign skip blocked
const es = await req('POST', `/tasks/${TID}/skip-occurrence`, { date: skipDate }, E);
check('foreign skip 404', es.status === 404, es.status);

// 7. bad date format rejected
const bd = await req('POST', `/tasks/${TID}/skip-occurrence`, { date: 'tomorrow' }, A);
check('bad date rejected', bd.status === 400, bd.status);

// 8. turning recurrence off clears rule
const off = await req('PATCH', `/tasks/${TID}`, { recurrenceType: 'NONE' }, A);
check('recurrence off clears rule', off.status === 200 && off.json.task.recurrenceRule === null, off.json.task);

// 9. clear due date works
const clr = await req('PATCH', `/tasks/${TID}`, { dueDate: null }, A);
check('due date cleared', clr.status === 200 && clr.json.task.dueDate === null, clr.json.task?.dueDate);

console.log(`RESULT pass=${pass} fail=${fail}`);
process.exit(fail ? 1 : 0);

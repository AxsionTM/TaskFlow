// E2E AI-агента (rule-based режим, без LLM-ключа).
// Проверяет реальные DB-эффекты, даты/timezone, confirm-flow и IDOR.
// Требует поднятый API на чистой БД.
// Запуск: npm run test:agent (E2E_BASE по умолчанию http://127.0.0.1:3999)
const B = process.env.E2E_BASE || 'http://127.0.0.1:3999';
const TZ = 'Asia/Almaty';
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
    console.log(`FAIL ${name} ${extra !== undefined ? JSON.stringify(extra)?.slice(0, 500) : ''}`);
  }
}

async function user(email) {
  const reg = await req('POST', '/auth/register', { email, password: 'secret12', confirmPassword: 'secret12' });
  const ver = await req('POST', '/auth/verify-email', { email, code: reg.json.devCode });
  return ver.json.token;
}

async function chat(token, message, conversationId) {
  return req('POST', '/agent/chat', { message, conversationId, timezone: TZ, clientNowISO: new Date().toISOString() }, token);
}

const A = await user('agent-a@test.com');
const E = await user('agent-e@test.com');
let conv = null;

// TASKS: создание через естественный язык с датой и приоритетом
let r = await chat(A, 'Создай задачу Подготовить презентацию завтра в 15:30 с высоким приоритетом');
conv = r.json.conversationId;
check('create NL task', r.status === 200 && /создал/i.test(r.json.reply) && (r.json.cards || []).length > 0, r.json);
const createdId = r.json.cards?.[0]?.task?.id;
const direct = await req('GET', '/tasks/today', null, A).catch(() => null);
void direct;
const allTasks = await req('GET', '/tasks?includeCompleted=true', null, A);
const created = (allTasks.json.tasks || []).find((t) => t.id === createdId);
check('task really in DB', Boolean(created) && created.priority === 'HIGH', created);
// завтра в Asia/Almaty: проверяем день и час в этой зоне
const parts = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(new Date(created.dueDate));
const p = Object.fromEntries(parts.map((x) => [x.type, x.value]));
const tomorrow = new Date(Date.now() + 86400000);
const tkey = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(tomorrow);
check('due date = tomorrow 15:30 Almaty', `${p.year}-${p.month}-${p.day}` === tkey && p.hour === '15' && p.minute === '30', p);

// Переименование
r = await chat(A, 'Переименуй её в Профессиональная презентация Q3', conv);
check('rename via pronoun', r.status === 200 && /новое название/i.test(r.json.reply), r.json);
const g1 = await req('GET', `/tasks/${createdId}`, null, A);
check('rename in DB', g1.json.task.title.includes('Профессиональная'), g1.json.task.title);

// Перенос на завтра 16:00 (местоимение + контекст)
r = await chat(A, 'Перенеси её на завтра на 16:00', conv);
check('move via context', r.status === 200 && /перенесена/i.test(r.json.reply), r.json);
const g2 = await req('GET', `/tasks/${createdId}`, null, A);
const hp = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(new Date(g2.json.task.dueDate)).map((x) => [x.type, x.value]));
check('moved hour 16:00', hp.hour === '16' && hp.minute === '00', hp);

// Приоритет
r = await chat(A, 'Поставь ей низкий приоритет', conv);
check('priority change', r.status === 200, r.json);
const g3 = await req('GET', `/tasks/${createdId}`, null, A);
check('priority in DB', g3.json.task.priority === 'LOW', g3.json.task.priority);

// SUBTASKS: разбить на 5
await req('PUT', `/notes/by-task/skip`, null, A).catch(() => null);
r = await chat(A, 'Разбей её на 5 подзадач: дизайн, верстка, тексты, фото, публикация', conv);
check('breakdown 5 subtasks', r.status === 200 && /создано 5/i.test(r.json.reply), r.json);
const subs = await req('GET', `/tasks/${createdId}`, null, A);
const kids = await (await fetch(B + `/tasks?includeCompleted=true`, { headers: { Authorization: 'Bearer ' + A } }).then((x) => x.json()).catch(() => ({ tasks: [] }))).tasks.filter((t) => t.parentId === createdId);
check('5 subtasks in DB', kids.length === 5, kids.length);
// Завершить вторую
r = await chat(A, 'Заверши вторую подзадачу', conv);
check('complete 2nd subtask', r.status === 200 && /завершена/i.test(r.json.reply), r.json);
const kids2 = (await req('GET', '/tasks?includeCompleted=true', null, A)).json.tasks.filter((t) => t.parentId === createdId);
check('2nd really completed', kids2.filter((t) => t.status === 'COMPLETED').length === 1, kids2.map((t) => t.status));

// NOTES: добавить + показать
r = await chat(A, 'Добавь в заметку: сначала сделать API', conv);
check('note append', r.status === 200, r.json);
const note = await req('GET', `/notes/by-task/${createdId}`, null, A);
check('note in DB', (note.json.note?.content || '').includes('сначала сделать API'), note.json);
r = await chat(A, 'Покажи заметку', conv);
check('note shown, not invented', r.status === 200 && r.json.reply.includes('сначала сделать API'), r.json.reply?.slice(0, 200));

// ANALYTICS: реальные цифры
r = await chat(A, 'Как прошёл мой день?', conv);
const todayCount = (await req('GET', '/tasks/today', null, A).catch(() => ({ json: { tasks: [] } })));
void todayCount;
check('day summary has numbers', r.status === 200 && /\d+/.test(r.json.reply), r.json.reply?.slice(0, 200));

// SECURITY: чужая задача через агента недоступна
const eTask = await req('POST', '/tasks', { title: 'eve secret' }, E);
r = await chat(A, `Найди задачу eve secret`, conv);
const leakedData = ((r.json.cards || []).length > 0);
const r2 = await chat(A, 'Удали задачу eve secret', conv);
check('no cross-user leak via agent', !leakedData && !r2.json.confirm && /не нашёл|какую/i.test(r2.json.reply || ''), (r.json.reply || '').slice(0, 200));

// DANGEROUS: delete требует confirm; без токена не выполняется
r = await chat(A, 'Удали задачу Профессиональная презентация', conv);
check('delete asks confirm', r.status === 200 && Boolean(r.json.confirm?.token), r.json);
const stillThere = await req('GET', `/tasks/${createdId}`, null, A);
check('not deleted before confirm', stillThere.status === 200, stillThere.status);
const badConfirm = await req('POST', '/agent/confirm', { conversationId: conv, token: 'bad', approved: true }, A);
check('bad token rejected', badConfirm.status === 400, badConfirm);
const okConfirm = await req('POST', '/agent/confirm', { conversationId: conv, token: r.json.confirm.token, approved: true }, A);
check('confirm executes', okConfirm.status === 200 && /выполнено/i.test(okConfirm.json.reply), okConfirm.json);
const gone = await req('GET', `/tasks/${createdId}`, null, A);
check('task really deleted', gone.status === 404, gone.status);

// MASS: просроченные → confirm
const od = await req('POST', '/tasks', { title: 'oldie', dueDate: new Date(Date.now() - 86400000).toISOString() }, A);
void od;
r = await chat(A, 'Перенеси все просроченные задачи на завтра', conv);
check('mass asks confirm', r.status === 200 && Boolean(r.json.confirm?.token), r.json);
if (r.json.confirm?.token) {
  const mc = await req('POST', '/agent/confirm', { conversationId: conv, token: r.json.confirm.token, approved: true }, A);
  check('mass executed', mc.status === 200 && /выполнено/i.test(mc.json.reply), mc.json);
  const odCheck = await req('GET', '/tasks?includeCompleted=true', null, A);
  const oldie = (odCheck.json.tasks || []).find((x) => x.title === 'oldie');
  check('mass really rescheduled', Boolean(oldie) && new Date(oldie.dueDate).getTime() > Date.now(), oldie?.dueDate);
} else {
  check('mass executed', false, 'no confirm token');
  check('mass really rescheduled', false, 'no confirm token');
}

// Conversations CRUD
const cl = await req('GET', '/agent/conversations', null, A);
check('conversations listed', cl.status === 200 && cl.json.conversations.length >= 1, cl.json);
const rn = await req('PATCH', `/agent/conversations/${conv}`, { title: 'Переименованный чат' }, A);
check('conversation renamed', rn.status === 200, rn);
const otherDel = await req('DELETE', `/agent/conversations/${conv}`, null, E);
check('foreign conversation protected', otherDel.status === 404, otherDel.status);

console.log(`RESULT pass=${pass} fail=${fail}`);
process.exit(fail ? 1 : 0);

// E2E сценарии TEST 1–14 из ТЗ (умное создание, диапазоны, patch-семантика).
// Требует поднятый API на чистой БД.
// Запуск: npm run test:agent2 (E2E_BASE по умолчанию http://127.0.0.1:3999)
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
  return req(
    'POST',
    '/agent/chat',
    { message, ...(conversationId ? { conversationId } : {}), timezone: TZ, clientNowISO: new Date().toISOString() },
    token
  );
}

function hm(iso) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false })
      .formatToParts(new Date(iso)).map((x) => [x.type, x.value])
  );
  return `${p.hour}:${p.minute}`;
}

function dayKey(iso) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso));
}

function tomorrowKey() {
  return dayKey(new Date(Date.now() + 86400000));
}

const A = await user('agent2-a@test.com');
let conv = null;
const say = async (msg) => {
  const r = await chat(A, msg, conv);
  conv = r.json.conversationId;
  if (process.env.E2E_DEBUG) console.log('>>>', msg, '\n<<<', (r.json.reply || '').slice(0, 300), '\n---');
  return r.json;
};

// TEST 1: умное создание с диапазоном
let r = await say('Создай мне завтра с 16 до 20 задачу созвониться с юристом.');
const t1 = r.cards?.find((c) => c.type === 'task')?.task;
check('T1 title extracted', t1 && t1.title === 'Созвониться с юристом', t1);
check('T1 no raw text in title', t1 && !/завтра|мне/i.test(t1.title), t1?.title);
const all1 = (await req('GET', '/tasks?includeCompleted=true', null, A)).json.tasks;
const db1 = all1.find((t) => t.id === t1?.id);
check('T1 start 16:00 end 20:00 tomorrow', db1 && dayKey(db1.dueDate) === tomorrowKey() && hm(db1.startDate) === '16:00' && hm(db1.dueDate) === '20:00', db1 && { s: hm(db1.startDate), e: hm(db1.dueDate), d: dayKey(db1.dueDate) });

// TEST 2: создание + подзадачи из перечисления
r = await say('Создай задачу Подготовить встречу завтра и сделай три подзадачи: подготовить документы, позвонить клиенту, назначить время.');
const t2 = r.cards?.find((c) => c.type === 'task')?.task;
check('T2 title', t2 && t2.title === 'Подготовить встречу', t2);
const kids2 = (await req('GET', '/tasks?includeCompleted=true', null, A)).json.tasks.filter((t) => t.parentId === t2?.id);
check('T2 3 subtasks in DB', kids2.length === 3, kids2.map((t) => t.title));
check('T2 subtask titles sane', kids2.every((t) => t.title.length > 3 && t.title.length < 80), kids2.map((t) => t.title));

// TEST 3-6 работают с задачей T1 (t1id). T3 называет её явно,
// дальше контекст уже на ней.
const t1id = t1?.id;
r = await say('Перенеси задачу «Созвониться с юристом» на понедельник.');
const after3 = (await req('GET', `/tasks/${t1id}`, null, A)).json.task;
check('T3 date moved, time kept', hm(after3.startDate) === '16:00' && hm(after3.dueDate) === '20:00', { s: hm(after3.startDate), e: hm(after3.dueDate) });

// TEST 4/5: только начало / только конец
r = await say('Поставь начало в 14:00.');
const after4 = (await req('GET', `/tasks/${t1id}`, null, A)).json.task;
check('T4 only start changed', hm(after4.startDate) === '14:00' && hm(after4.dueDate) === '20:00', { s: hm(after4.startDate), e: hm(after4.dueDate) });
r = await say('Поставь окончание на 21:00.');
const after5 = (await req('GET', `/tasks/${t1id}`, null, A)).json.task;
check('T5 only end changed', hm(after5.startDate) === '14:00' && hm(after5.dueDate) === '21:00', { s: hm(after5.startDate), e: hm(after5.dueDate) });

// TEST 6: заметка, не title
r = await say('Добавь в заметку, что нужно подготовить документы.');
const note6 = await req('GET', `/notes/by-task/${t1id}`, null, A);
const task6 = (await req('GET', `/tasks/${t1id}`, null, A)).json.task;
check('T6 note updated, title intact', (note6.json.note?.content || '').includes('подготовить документы') && task6.title === 'Созвониться с юристом', { n: note6.json.note?.content, t: task6.title });

// TEST 8: разбить существующую (из описания/заметки).
// Явно называем задачу T2, т.к. контекст сейчас на задаче T1.
await req('PATCH', `/tasks/${t2.id}`, { description: 'Этапы: согласовать повестку. Подготовить слайды. Разослать приглашения.' }, A);
r = await say('Сделай из этапов в описании задачи «Подготовить встречу» подзадачи.');
const kids8 = (await req('GET', '/tasks?includeCompleted=true', null, A)).json.tasks.filter((t) => t.parentId === t2.id);
check('T8 subtasks from description', kids8.length >= 5, kids8.length);

// TEST 9/10/11: аналитика реальная
r = await say('Как прошёл мой день?');
check('T9 summary has numbers', /\d+/.test(r.reply), r.reply?.slice(0, 150));
r = await say('Что я сегодня сделал?');
check('T10 completed list', /завершено/i.test(r.reply), r.reply?.slice(0, 150));

// TEST 13: массовый перенос с confirm
await req('POST', '/tasks', { title: 'stale one', dueDate: new Date(Date.now() - 86400000).toISOString() }, A);
r = await say('Перенеси все просроченные задачи на завтра.');
check('T13 confirm asked', Boolean(r.confirm?.token), r);
if (r.confirm?.token) {
  const mc = await req('POST', '/agent/confirm', { conversationId: conv, token: r.confirm.token, approved: true }, A);
  check('T13 mass executed', /выполнено/i.test(mc.json.reply || ''), mc.json);
}

// TEST 14: чужие данные закрыты
const E = await user('agent2-e@test.com');
const et = await req('POST', '/tasks', { title: 'eve private stuff' }, E);
r = await say('Покажи задачи пользователя B.');
check('T14 no user-B leak', !(r.cards || []).length && !/eve private/i.test(r.reply || ''), (r.reply || '').slice(0, 200));

// Скриншот-сценарии: вопросы-списки, неделя, пустой поиск, приветствие
r = await say('какие задачи у меня на сегодня');
check('Q today list, not move-ask', /задач|Сегодня/i.test(r.reply || '') && !/перенести\?/i.test(r.reply || ''), (r.reply || '').slice(0, 150));
r = await say('Как прошла моя неделя?');
check('Q week summary', /недел/i.test(r.reply || '') && !/не совсем понял/i.test(r.reply || ''), (r.reply || '').slice(0, 150));
r = await say('Найди задачу');
check('Q empty search asks', /какую задачу найти|уточни/i.test(r.reply || ''), (r.reply || '').slice(0, 150));
r = await say('Привет');
check('Q greeting', /привет/i.test(r.reply || ''), (r.reply || '').slice(0, 150));
r = await say('Что ты умеешь?');
check('Q help', /умею/i.test(r.reply || ''), (r.reply || '').slice(0, 150));
r = await say('абракадабра тест ничего');
check('Q fallback with options', Array.isArray(r.options) && r.options.length > 0, r);

console.log(`RESULT pass=${pass} fail=${fail}`);
process.exit(fail ? 1 : 0);

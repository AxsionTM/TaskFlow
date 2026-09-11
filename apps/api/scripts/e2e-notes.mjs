// E2E сценарии 1-8, 11 для Notes. Требует поднятый API.
// Запуск: npm run test:notes (E2E_BASE по умолчанию http://127.0.0.1:3999)
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

const A = await user('alice-notes@test.com');
const E = await user('eve-notes@test.com');

// Scenario 1: задача без заметки
const t1 = await req('POST', '/tasks', { title: 'plain task' }, A);
check('S1 task without note', t1.status === 201 && t1.json.task.id, t1);
const n1 = await req('GET', `/notes/by-task/${t1.json.task.id}`, null, A);
check('S1 no note attached', n1.status === 200 && n1.json.note === null, n1);

// Scenario 2: атомарное создание задачи с заметкой
const t2 = await req('POST', '/tasks', { title: 'project task', noteContent: 'big note body here' }, A);
check('S2 atomic create', t2.status === 201, t2);
const list2 = await req('GET', '/notes', null, A);
check(
  'S2 note in list with preview, no full content leak',
  list2.status === 200 &&
    list2.json.notes.length === 1 &&
    list2.json.notes[0].preview.length > 0 &&
    !('content' in list2.json.notes[0]) &&
    list2.json.notes[0].taskTitle === 'project task',
  list2.json
);
const NID = list2.json.notes[0].id;

// Scenario 3: превью обрезано для длинного текста
const big = 'word '.repeat(500);
const t3 = await req('POST', '/tasks', { title: 'long task', noteContent: big }, A);
check('S3 big note accepted', t3.status === 201, t3.status);
const list3 = await req('GET', '/notes', null, A);
const longPrev = list3.json.notes.find((n) => n.taskTitle === 'long task');
check('S3 preview truncated', longPrev && longPrev.preview.length <= 160, longPrev?.preview?.length);

// Scenario 4: редактирование без reload (PUT возвращает обновлённое)
const upd = await req('PUT', `/notes/${NID}`, { content: 'edited body v2' }, A);
check('S4 update returns new content', upd.status === 200 && upd.json.note.content === 'edited body v2', upd.json);
const get4 = await req('GET', `/notes/${NID}`, null, A);
check('S4 persisted', get4.status === 200 && get4.json.note.content === 'edited body v2', get4.json);

// Scenario 5: переименование задачи → пилл обновляется (нет noteTitle)
await req('PATCH', `/tasks/${t2.json.task.id}`, { title: 'renamed project' }, A);
const list5 = await req('GET', '/notes', null, A);
check(
  'S5 pill follows task title',
  list5.json.notes.some((n) => n.id === NID && n.taskTitle === 'renamed project'),
  list5.json.notes
);

// Validation
const empty = await req('POST', '/notes', { taskId: t1.json.task.id, content: '   ' }, A);
check('empty note rejected', empty.status === 400, empty);
const dup = await req('POST', '/notes', { taskId: t2.json.task.id, content: 'second' }, A);
check('second note for task rejected', dup.status === 409, dup);
const huge = await req('POST', '/notes', { taskId: t1.json.task.id, content: 'x'.repeat(20001) }, A);
check('oversize rejected', huge.status === 400, huge);
const ghost = await req('POST', '/notes', { taskId: 'nonexistent-id', content: 'hi' }, A);
check('ghost task rejected', ghost.status === 404, ghost);

// Scenario 8: чужие данные недоступны
const e1 = await req('GET', `/notes/${NID}`, null, E);
check('S8 foreign read blocked', e1.status === 404, e1);
const e2 = await req('PUT', `/notes/${NID}`, { content: 'hacked' }, E);
check('S8 foreign write blocked', e2.status === 404, e2);
const e3 = await req('DELETE', `/notes/${NID}`, null, E);
check('S8 foreign delete blocked', e3.status === 404, e3);
const e4 = await req('POST', '/notes', { taskId: t2.json.task.id, content: 'hijack' }, E);
check('S8 attach to foreign task blocked', e4.status === 404, e4);

// Scenario 6: удаление заметки оставляет задачу
const del = await req('DELETE', `/notes/${NID}`, null, A);
check('S6 note deleted', del.status === 200, del);
const stillTask = await req('GET', `/tasks/${t2.json.task.id}`, null, A);
check('S6 task survives', stillTask.status === 200 && stillTask.json.task.id, stillTask.status);

// Scenario 7: удаление задачи удаляет заметку (permanent)
const t7 = await req('POST', '/tasks', { title: 'doomed', noteContent: 'bye' }, A);
const n7 = (await req('GET', '/notes', null, A)).json.notes.find((n) => n.taskTitle === 'doomed');
await req('DELETE', `/tasks/${t7.json.task.id}`, null, A); // soft → в корзину
const afterSoft = await req('GET', `/notes/${n7.id}`, null, A);
check('S7 soft delete keeps note (restorable)', afterSoft.status === 200, afterSoft.status);
await req('DELETE', `/tasks/${t7.json.task.id}/permanent`, null, A);
const afterHard = await req('GET', `/notes/${n7.id}`, null, A);
check('S7 permanent delete cascades note', afterHard.status === 404, afterHard);

// Scenario 11 (API-часть): список снова без удалённого
const fin = await req('GET', '/notes', null, A);
check('S11 list consistent', fin.status === 200 && !fin.json.notes.some((n) => n.id === NID), fin.json);

console.log(`RESULT pass=${pass} fail=${fail}`);
process.exit(fail ? 1 : 0);

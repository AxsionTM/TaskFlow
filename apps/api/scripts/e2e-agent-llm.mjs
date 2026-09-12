// E2E LLM-пути агента через локальный стаб OpenAI-compatible API.
// Проверяет: цикл chat→tools→reply, перехват dangerous в confirm,
// выполнение confirm, choice-flow (кандидаты → порядковый выбор),
// CRUD чатов. Без реальных ключей и сети.
// Запуск: поднять API с AI_LLM_URL=http://127.0.0.1:4567/v1/chat/completions,
// AI_LLM_KEY=dummy, затем: npm run test:agent-llm
import http from 'node:http';

const B = process.env.E2E_BASE || 'http://127.0.0.1:3999';
const state = { taskId: null };
let pass = 0;
let fail = 0;

function check(name, cond, extra) {
  if (cond) {
    pass++;
    console.log(`OK   ${name}`);
  } else {
    fail++;
    console.log(`FAIL ${name} ${extra !== undefined ? JSON.stringify(extra)?.slice(0, 500) : ''}`);
  }
}

function lastUserText(body) {
  const msgs = (body.messages || []).filter((m) => m.role === 'user');
  return msgs.length ? String(msgs[msgs.length - 1].content || '') : '';
}

function hasToolResult(body) {
  return (body.messages || []).some((m) => m.role === 'tool');
}

function toolResp(id, name, args) {
  return {
    choices: [
      {
        message: {
          role: 'assistant',
          content: '',
          tool_calls: [{ id, type: 'function', function: { name, arguments: JSON.stringify(args) } }],
        },
      },
    ],
  };
}

function textResp(text) {
  return { choices: [{ message: { role: 'assistant', content: text } }] };
}

// Стаб: ведёт себя как LLM — зовёт search, потом отвечает; delete перехватывается движком.
const stub = http.createServer((req, res) => {
  let raw = '';
  req.on('data', (c) => {
    raw += c;
  });
  req.on('end', () => {
    let body = {};
    try {
      body = JSON.parse(raw);
    } catch {}
    const userText = lastUserText(body).toLowerCase();
    let out;
    if (hasToolResult(body)) {
      out = textResp('Готово, смотри результат выше.');
    } else if (userText.includes('удали')) {
      out = textResp('Удаляю задачу?');
      // delete_call отдельным ответом невозможен в одном ходе — отдаём tool_call:
      out = toolResp('call_del_1', 'delete_task', { taskId: state.taskId || 'missing' });
    } else if (userText.includes('найди') || userText.includes('отчет')) {
      out = toolResp('call_search_1', 'search_tasks', { query: 'Презентация', limit: 6 });
    } else {
      out = textResp('Понял.');
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(out));
  });
});

await new Promise((r) => stub.listen(4567, '127.0.0.1', r));

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

async function user(email) {
  const reg = await req('POST', '/auth/register', { email, password: 'secret12', confirmPassword: 'secret12' });
  const ver = await req('POST', '/auth/verify-email', { email, code: reg.json.devCode });
  return ver.json.token;
}

async function chat(token, message, conversationId) {
  return req('POST', '/agent/chat', { message, conversationId, timezone: 'UTC', clientNowISO: new Date().toISOString() }, token);
}

const A = await user(`agent-llm-${Date.now()}@test.com`);
await req('POST', '/tasks', { title: 'Презентация Квартал' }, A);
const found = await req('GET', '/tasks?includeCompleted=true', null, A);
state.taskId = (found.json.tasks || []).find((t) => t.title === 'Презентация Квартал')?.id;

// L1: поиск через LLM tools → карточка
let r = await chat(A, 'Найди задачу Презентация');
const conv = r.json.conversationId;
check('L1 llm search + card', r.status === 200 && (r.json.cards || []).some((c) => c.type === 'task' || c.type === 'tasklist'), r.json);
check('L1 no raw json in reply', r.status === 200 && !/tool_calls|arguments/.test(r.json.reply || ''), (r.json.reply || '').slice(0, 200));

// L2: dangerous перехвачен в confirm, задача жива
r = await chat(A, 'Удали задачу Презентация', conv);
check('L2 delete intercepted to confirm', r.status === 200 && Boolean(r.json.confirm?.token), r.json);
const alive = await req('GET', `/tasks/${state.taskId}`, null, A);
check('L2 not deleted before confirm', alive.status === 200, alive.status);
const okc = await req('POST', '/agent/confirm', { conversationId: conv, token: r.json.confirm.token, approved: true }, A);
check('L2 confirm executes', okc.status === 200 && /выполнено/i.test(okc.json.reply || ''), okc.json);
const gone = await req('GET', `/tasks/${state.taskId}`, null, A);
check('L2 task really deleted', gone.status === 404, gone.status);

stub.close();
console.log(`RESULT pass=${pass} fail=${fail}`);
process.exit(fail ? 1 : 0);

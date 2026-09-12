/**
 * LLM-клиент: OpenAI-совместимый Chat Completions endpoint.
 * Ключ и URL — только env backend, никогда не уходят во frontend и в LLM
 * не передаётся ничего кроме данных текущего пользователя и его сообщения.
 * Без ключа движок работает в детерминированном rule-based режиме.
 */

const TIMEOUT_MS = 30000;

export function isLlmConfigured(): boolean {
  return Boolean(process.env.AI_LLM_KEY);
}

export interface LlmToolDef {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface LlmMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_calls?: { id: string; name: string; arguments: string }[];
  tool_call_id?: string;
}

export interface LlmToolCall {
  id: string;
  name: string;
  arguments: Record<string, any>;
}

export interface LlmResult {
  text: string;
  toolCalls: LlmToolCall[];
}

/**
 * Один шаг chat completions с tools. Возвращает текст и вызовы инструментов.
 */
export async function chatWithTools(
  messages: LlmMessage[],
  tools: LlmToolDef[],
  maxTokens = 1200
): Promise<LlmResult> {
  const url = process.env.AI_LLM_URL || 'https://api.openai.com/v1/chat/completions';
  const model = process.env.AI_LLM_MODEL || 'gpt-4o-mini';
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.AI_LLM_KEY}`,
      },
      body: JSON.stringify({
        model,
        messages: messages.map((m) => {
          if (m.role === 'tool') {
            return { role: 'tool', content: m.content, tool_call_id: m.tool_call_id };
          }
          if (m.tool_calls?.length) {
            return {
              role: 'assistant',
              content: m.content || '',
              tool_calls: m.tool_calls.map((t) => ({
                id: t.id,
                type: 'function',
                function: { name: t.name, arguments: t.arguments },
              })),
            };
          }
          return { role: m.role, content: m.content };
        }),
        tools: tools.map((t) => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.parameters } })),
        tool_choice: 'auto',
        temperature: 0.2,
        max_tokens: maxTokens,
      }),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) {
      throw new Error(`LLM http ${res.status}`);
    }
    const data = (await res.json()) as any;
    const msg = data.choices?.[0]?.message;
    const toolCalls: LlmToolCall[] = (msg?.tool_calls || [])
      .filter((t: any) => t.type === 'function')
      .map((t: any) => {
        let args: Record<string, any> = {};
        try {
          args = JSON.parse(t.function?.arguments || '{}');
        } catch {
          args = {};
        }
        return { id: t.id, name: t.function?.name, arguments: args };
      })
      .filter((t: LlmToolCall) => typeof t.name === 'string');
    return { text: typeof msg?.content === 'string' ? msg.content : '', toolCalls };
  } catch (e) {
    clearTimeout(timeout);
    throw e;
  }
}

/** Простой текстовый вызов без tools (перефразирование, исправление текста). */
export async function chatText(system: string, user: string, maxTokens = 800): Promise<string> {
  const r = await chatWithTools(
    [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    [],
    maxTokens
  );
  return r.text;
}

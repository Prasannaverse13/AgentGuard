/**
 * Optional model help. OpenAI when OPENAI_API_KEY is set, else NEAR AI (OpenAI compatible).
 * Used to word the agent's reason and to review text in the privacy audit.
 * Money decisions never depend on it. Without a key every call returns the fallback.
 */
interface Provider {
  base: string;
  key: string;
  model: string;
  openai: boolean;
}

export function provider(env: Record<string, string | undefined> = process.env): Provider | null {
  if (env.OPENAI_API_KEY) {
    return { base: env.OPENAI_BASE_URL ?? "https://api.openai.com/v1", key: env.OPENAI_API_KEY, model: env.OPENAI_MODEL ?? "gpt-5-mini", openai: true };
  }
  if (env.NEAR_AI_API_KEY) {
    return { base: env.NEAR_AI_BASE_URL ?? "https://cloud-api.near.ai/v1", key: env.NEAR_AI_API_KEY, model: env.NEAR_AI_MODEL ?? "deepseek-ai/DeepSeek-V3.1", openai: false };
  }
  return null;
}

export const modelName = () => provider()?.model ?? null;

/** One chat call. Returns null on any failure so callers can fall back. */
export async function chat(system: string, user: string, maxTokens = 400, timeoutMs = 20000): Promise<string | null> {
  const p = provider();
  if (!p) return null;
  try {
    const body: Record<string, unknown> = {
      model: p.model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    };
    // Newer OpenAI models take max_completion_tokens and only the default temperature.
    if (p.openai) body.max_completion_tokens = Math.max(maxTokens, 2000);
    else {
      body.max_tokens = maxTokens;
      body.temperature = 0.2;
    }
    const res = await fetch(`${p.base}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${p.key}` },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    return data.choices?.[0]?.message?.content?.trim() || null;
  } catch {
    return null;
  }
}

/** Parses the first JSON value in a model answer. */
export function firstJson<T>(text: string | null): T | null {
  if (!text) return null;
  const m = text.match(/[[{][\s\S]*[\]}]/);
  if (!m) return null;
  try {
    return JSON.parse(m[0]) as T;
  } catch {
    return null;
  }
}

export async function explain(prompt: string, fallback: string): Promise<string> {
  const text = await chat(
    "You write one short plain sentence (under 20 words) saying why a business payment is being made. No quotes. No dashes. Never include emails, phone numbers, bank or card numbers, or personal names.",
    prompt,
    80,
    8000,
  );
  return text && text.length <= 300 ? text : fallback;
}

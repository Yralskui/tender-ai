/** In-memory cooldown после 429 от Groq (сбрасывается при перезапуске сервера). */
let rateLimitedUntil = 0;
let rateLimitWarned = false;

export function isGroqRateLimited(): boolean {
  return Date.now() < rateLimitedUntil;
}

export function getGroqRateLimitRetryMinutes(): number | null {
  if (!isGroqRateLimited()) return null;
  return Math.max(1, Math.ceil((rateLimitedUntil - Date.now()) / 60_000));
}

function parseRetryMs(message: string): number {
  const match = message.match(/try again in (\d+)m([\d.]+)s/i);
  if (!match) return 60 * 60_000;
  return (parseInt(match[1], 10) * 60 + parseFloat(match[2])) * 1000;
}

export function isGroqRateLimitError(error: unknown): boolean {
  const msg = String(error instanceof Error ? error.message : error);
  return msg.includes("429") || msg.includes("rate_limit") || msg.includes("Rate limit");
}

export function markGroqRateLimited(error: unknown): void {
  const msg = String(error instanceof Error ? error.message : error);
  rateLimitedUntil = Math.max(rateLimitedUntil, Date.now() + parseRetryMs(msg));
  if (!rateLimitWarned) {
    const mins = getGroqRateLimitRetryMinutes();
    console.warn(
      `[Groq] Дневной лимит токенов исчерпан${mins ? ` (~${mins} мин до сброса)` : ""}. AI-запросы приостановлены, работает анализ по правилам.`
    );
    rateLimitWarned = true;
  }
}

/** Глубокий AI-анализ тендера — дорогой по токенам, по умолчанию выключен. */
export function isGroqTenderMatchEnabled(): boolean {
  return process.env.GROQ_TENDER_MATCH === "true";
}

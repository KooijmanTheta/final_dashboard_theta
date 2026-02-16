const SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL;

interface SlackResult {
  ok: boolean;
  error?: string;
  httpStatus?: number;
}

/**
 * Post a Block Kit message payload to the configured Slack webhook.
 * No npm dependency — plain fetch.
 */
export async function postToSlack(payload: Record<string, unknown>): Promise<SlackResult> {
  if (!SLACK_WEBHOOK_URL) {
    return { ok: false, error: 'SLACK_WEBHOOK_URL not configured' };
  }

  try {
    const res = await fetch(SLACK_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const text = await res.text();
      return { ok: false, error: text, httpStatus: res.status };
    }

    return { ok: true, httpStatus: res.status };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

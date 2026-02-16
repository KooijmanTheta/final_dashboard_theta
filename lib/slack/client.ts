import { createHmac, timingSafeEqual } from 'crypto';

const SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL;
const SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN;
const SLACK_SIGNING_SECRET = process.env.SLACK_SIGNING_SECRET;

export interface SlackResult {
  ok: boolean;
  error?: string;
  httpStatus?: number;
  ts?: string; // message timestamp (for bot messages)
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

/**
 * Post a message to a channel using the Bot User OAuth Token (chat.postMessage).
 * Returns the message `ts` needed for later updates.
 */
export async function postBotMessage(
  channel: string,
  blocks: Record<string, unknown>[],
  text: string,
): Promise<SlackResult> {
  if (!SLACK_BOT_TOKEN) {
    return { ok: false, error: 'SLACK_BOT_TOKEN not configured' };
  }

  try {
    const res = await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${SLACK_BOT_TOKEN}`,
      },
      body: JSON.stringify({ channel, blocks, text }),
    });

    const data = await res.json();
    if (!data.ok) {
      return { ok: false, error: data.error, httpStatus: res.status };
    }

    return { ok: true, httpStatus: res.status, ts: data.ts };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Update an existing bot message in-place (chat.update).
 */
export async function updateBotMessage(
  channel: string,
  ts: string,
  blocks: Record<string, unknown>[],
  text?: string,
): Promise<SlackResult> {
  if (!SLACK_BOT_TOKEN) {
    return { ok: false, error: 'SLACK_BOT_TOKEN not configured' };
  }

  try {
    const res = await fetch('https://slack.com/api/chat.update', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${SLACK_BOT_TOKEN}`,
      },
      body: JSON.stringify({ channel, ts, blocks, text: text || 'Overdue Report' }),
    });

    const data = await res.json();
    if (!data.ok) {
      return { ok: false, error: data.error, httpStatus: res.status };
    }

    return { ok: true, httpStatus: res.status, ts: data.ts };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Verify that an incoming request is genuinely from Slack using HMAC-SHA256.
 * Returns true if the signature is valid.
 */
export function verifySlackSignature(
  rawBody: string,
  timestamp: string,
  signature: string,
): boolean {
  if (!SLACK_SIGNING_SECRET) return false;

  // Reject requests older than 5 minutes to prevent replay attacks
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - parseInt(timestamp)) > 300) return false;

  const sigBasestring = `v0:${timestamp}:${rawBody}`;
  const mySignature = 'v0=' + createHmac('sha256', SLACK_SIGNING_SECRET)
    .update(sigBasestring)
    .digest('hex');

  try {
    return timingSafeEqual(Buffer.from(mySignature), Buffer.from(signature));
  } catch {
    return false;
  }
}

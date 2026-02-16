import { NextRequest, NextResponse } from 'next/server';
import { verifySlackSignature } from '@/lib/slack/client';
import { parseActionId, buildInteractiveOverdueAlert } from '@/lib/slack/message-builder';
import { getOverdueItemsForSlack } from '@/lib/slack/notification-service';

export const dynamic = 'force-dynamic';
export const maxDuration = 10;

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const timestamp = req.headers.get('x-slack-request-timestamp') || '';
  const signature = req.headers.get('x-slack-signature') || '';

  if (!verifySlackSignature(rawBody, timestamp, signature)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  const params = new URLSearchParams(rawBody);
  const payloadStr = params.get('payload');
  if (!payloadStr) {
    return NextResponse.json({ error: 'Missing payload' }, { status: 400 });
  }

  const payload = JSON.parse(payloadStr);

  if (payload.type !== 'block_actions') {
    return new NextResponse('', { status: 200 });
  }

  const action = payload.actions?.[0];
  if (!action) {
    return new NextResponse('', { status: 200 });
  }

  const filters = parseActionId(action.action_id);
  if (!filters) {
    return new NextResponse('', { status: 200 });
  }

  const responseUrl: string | undefined = payload.response_url;

  try {
    const overdueItems = await getOverdueItemsForSlack();
    const { blocks } = buildInteractiveOverdueAlert(overdueItems, filters);

    if (responseUrl) {
      // Use response_url to replace the original message
      await fetch(responseUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          replace_original: true,
          blocks,
          text: 'Overdue Report',
        }),
      });
    } else {
      // Fallback: direct API update
      const { updateBotMessage } = await import('@/lib/slack/client');
      const channel = payload.channel?.id;
      const messageTs = payload.message?.ts;
      if (channel && messageTs) {
        await updateBotMessage(channel, messageTs, blocks, 'Overdue Report');
      }
    }
  } catch (err) {
    console.error('Slack interaction handler error:', err);
  }

  return new NextResponse('', { status: 200 });
}

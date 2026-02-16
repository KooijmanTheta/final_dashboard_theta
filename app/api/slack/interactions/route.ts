import { NextRequest, NextResponse } from 'next/server';
import { verifySlackSignature, updateBotMessage } from '@/lib/slack/client';
import { parseActionId, buildInteractiveOverdueAlert, applyFilters } from '@/lib/slack/message-builder';
import { getOverdueItemsForSlack } from '@/lib/slack/notification-service';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  // Read raw body for signature verification
  const rawBody = await req.text();
  const timestamp = req.headers.get('x-slack-request-timestamp') || '';
  const signature = req.headers.get('x-slack-signature') || '';

  if (!verifySlackSignature(rawBody, timestamp, signature)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  // Slack sends interactions as application/x-www-form-urlencoded with a `payload` field
  const params = new URLSearchParams(rawBody);
  const payloadStr = params.get('payload');
  if (!payloadStr) {
    return NextResponse.json({ error: 'Missing payload' }, { status: 400 });
  }

  const payload = JSON.parse(payloadStr);

  // We only handle block_actions (button clicks)
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

  const channel = payload.channel?.id;
  const messageTs = payload.message?.ts;

  if (!channel || !messageTs) {
    return new NextResponse('', { status: 200 });
  }

  // Respond immediately to Slack (must reply within 3s)
  // Then update the message asynchronously
  // Since Vercel serverless functions can't run after response, we do it before responding
  // but we keep it fast by reusing cached data pattern

  try {
    const overdueItems = await getOverdueItemsForSlack();
    const { blocks } = buildInteractiveOverdueAlert(overdueItems, filters);

    await updateBotMessage(channel, messageTs, blocks, 'Overdue Report');
  } catch (err) {
    console.error('Slack interaction handler error:', err);
  }

  return new NextResponse('', { status: 200 });
}

import { NextRequest, NextResponse } from 'next/server';
import { seedSnapshot } from '@/lib/slack/notification-service';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await seedSnapshot();
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error('seed-snapshot error:', err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}

import { NextResponse } from 'next/server';

export const revalidate = 120;

export async function GET() {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    const res = await fetch(
      'https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=10&page=1&sparkline=false&price_change_percentage=24h',
      {
        signal: controller.signal,
        next: { revalidate: 120 },
      }
    );
    clearTimeout(timeout);

    if (!res.ok) {
      console.error('CoinGecko API error:', res.status);
      return NextResponse.json([]);
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Error fetching crypto market data:', error);
    return NextResponse.json([]);
  }
}

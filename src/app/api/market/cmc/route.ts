import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function GET() {
  const apiKey = process.env.CMC_API_KEY;

  if (!apiKey) {
    return NextResponse.json(
      { error: 'CMC_API_KEY is not set on server.' },
      { status: 503 },
    );
  }

  const url = new URL('https://pro-api.coinmarketcap.com/v1/cryptocurrency/listings/latest');
  url.searchParams.set('start', '1');
  url.searchParams.set('limit', '8');
  url.searchParams.set('convert', 'USD');

  const res = await fetch(url.toString(), {
    headers: {
      'X-CMC_PRO_API_KEY': apiKey,
      Accept: 'application/json',
    },
    cache: 'no-store',
  });

  const text = await res.text();
  if (!res.ok) {
    return NextResponse.json({ error: text || 'CMC request failed' }, { status: 502 });
  }

  return new NextResponse(text, {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

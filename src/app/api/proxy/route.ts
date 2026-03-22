import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const endpoint = searchParams.get('endpoint');
  const env = searchParams.get('env');
  
  if (!endpoint) {
    return NextResponse.json({ error: 'Missing endpoint' }, { status: 400 });
  }

  const baseUrl = env === 'sandbox' 
    ? 'https://sandbox.greeninvoice.co.il/api/v1' 
    : 'https://api.greeninvoice.co.il/api/v1';

  try {
    const body = await req.json();
    const token = req.headers.get('Authorization');

    const response = await fetch(`${baseUrl}/${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': token || '',
      },
      body: JSON.stringify(body),
    });

    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

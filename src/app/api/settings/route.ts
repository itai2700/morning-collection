import { neon } from '@neondatabase/serverless';
import { NextResponse } from 'next/server';

function getDb() {
  if (!process.env.DATABASE_URL) return null;
  return neon(process.env.DATABASE_URL);
}

export async function GET() {
  const sql = getDb();
  if (!sql) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 503 });
  }

  try {
    // Create table if not exists (for initial setup)
    await sql`CREATE TABLE IF NOT EXISTS global_settings (
      id VARCHAR(50) PRIMARY KEY,
      value TEXT NOT NULL
    )`;

    const result = await sql`SELECT value FROM global_settings WHERE id = 'app_settings'`;
    if (result.length > 0) {
      return NextResponse.json(JSON.parse(result[0].value));
    }
    return NextResponse.json({});
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const sql = getDb();
  if (!sql) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 503 });
  }

  try {
    const body = await req.json();
    
    await sql`CREATE TABLE IF NOT EXISTS global_settings (
      id VARCHAR(50) PRIMARY KEY,
      value TEXT NOT NULL
    )`;
    
    await sql`
      INSERT INTO global_settings (id, value)
      VALUES ('app_settings', ${JSON.stringify(body)})
      ON CONFLICT (id) DO UPDATE SET value = EXCLUDED.value
    `;
    
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

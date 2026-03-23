import { NextResponse } from "next/server";
import { fetchMorningToken } from "@/lib/morning";
import { requireDb } from "@/lib/db";
import { requireAppSession } from "@/lib/session";

export async function POST(req: Request) {
  const { session, response } = await requireAppSession();
  if (response || !session) {
    return response;
  }

  try {
    const body = (await req.json()) as {
      apiKeyId?: string;
      apiSecret?: string;
      env?: string;
    };

    if (!body.apiKeyId || !body.apiSecret) {
      return NextResponse.json({ error: "Missing API credentials" }, { status: 400 });
    }

    await fetchMorningToken({
      apiKeyId: body.apiKeyId,
      apiSecret: body.apiSecret,
      env: body.env ?? "production",
    });

    const sql = await requireDb();
    await sql`
      UPDATE organizations
      SET
        morning_env = ${body.env ?? "production"},
        updated_at = NOW()
      WHERE id = ${session.user.organizationId}
    `;

    await sql`
      INSERT INTO organization_secrets (organization_id, morning_api_key_id, morning_api_secret)
      VALUES (
        ${session.user.organizationId},
        ${body.apiKeyId},
        ${body.apiSecret}
      )
      ON CONFLICT (organization_id) DO UPDATE SET
        morning_api_key_id = EXCLUDED.morning_api_key_id,
        morning_api_secret = EXCLUDED.morning_api_secret,
        updated_at = NOW()
    `;

    return NextResponse.json({ success: true, connected: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to save credentials" },
      { status: 500 },
    );
  }
}


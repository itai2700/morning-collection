import { NextResponse } from "next/server";
import { requireDb } from "@/lib/db";
import { requireAppSession } from "@/lib/session";

export async function GET() {
  const { session, response } = await requireAppSession();
  if (response || !session) {
    return response;
  }

  try {
    const sql = await requireDb();
    const rows = (await sql`
      SELECT
        reminder_events.id,
        reminder_events.invoice_id,
        reminder_events.client_id,
        reminder_events.channel,
        reminder_events.recipient,
        reminder_events.sent_at,
        app_users.name AS sent_by_name
      FROM reminder_events
      JOIN app_users ON app_users.id = reminder_events.user_id
      WHERE reminder_events.organization_id = ${session.user.organizationId}
      ORDER BY reminder_events.sent_at DESC
      LIMIT 100
    `) as Array<{
      id: number;
      invoice_id: string;
      client_id: string;
      channel: "whatsapp" | "email";
      recipient: string;
      sent_at: string;
      sent_by_name: string | null;
    }>;

    return NextResponse.json({
      events: rows.map((row) => ({
        id: Number(row.id),
        invoiceId: row.invoice_id,
        clientId: row.client_id,
        channel: row.channel,
        recipient: row.recipient,
        sentAt: row.sent_at,
        sentByName: row.sent_by_name,
      })),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load reminders" },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  const { session, response } = await requireAppSession();
  if (response || !session) {
    return response;
  }

  try {
    const body = (await req.json()) as {
      events?: Array<{
        invoiceId: string;
        clientId: string;
        channel: "whatsapp" | "email";
        recipient?: string;
      }>;
    };

    const events = body.events ?? [];
    if (events.length === 0) {
      return NextResponse.json({ error: "No reminder events provided" }, { status: 400 });
    }

    const sql = await requireDb();
    await Promise.all(
      events.map(async (event) => {
        await sql`
          INSERT INTO reminder_events (organization_id, user_id, invoice_id, client_id, channel, recipient)
          VALUES (
            ${session.user.organizationId},
            ${session.user.id},
            ${event.invoiceId},
            ${event.clientId},
            ${event.channel},
            ${event.recipient ?? ""}
          )
        `;

        await sql`
          INSERT INTO invoice_metadata (
            organization_id,
            invoice_id,
            client_id,
            last_reminder_at,
            last_reminder_channel,
            reminder_count,
            last_reminder_by_user_id
          )
          VALUES (
            ${session.user.organizationId},
            ${event.invoiceId},
            ${event.clientId},
            NOW(),
            ${event.channel},
            1,
            ${session.user.id}
          )
          ON CONFLICT (organization_id, invoice_id) DO UPDATE SET
            client_id = EXCLUDED.client_id,
            last_reminder_at = NOW(),
            last_reminder_channel = EXCLUDED.last_reminder_channel,
            reminder_count = invoice_metadata.reminder_count + 1,
            last_reminder_by_user_id = EXCLUDED.last_reminder_by_user_id
        `;
      }),
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to record reminders" },
      { status: 500 },
    );
  }
}

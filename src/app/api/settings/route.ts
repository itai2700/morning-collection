import { NextResponse } from "next/server";
import {
  DEFAULT_BUSINESS_NAME,
  DEFAULT_EMAIL_SUBJECT,
  DEFAULT_EMAIL_TEMPLATE,
  DEFAULT_ENV,
  DEFAULT_WHATSAPP_TEMPLATE,
} from "@/lib/constants";
import { requireDb } from "@/lib/db";
import { getLocalSettings, saveLocalSettings } from "@/lib/local-store";
import { requireAppSession } from "@/lib/session";
import { hasDatabase } from "@/lib/storage";
import type { SettingsPayload } from "@/lib/types";

const DEFAULT_SETTINGS: SettingsPayload = {
  businessName: DEFAULT_BUSINESS_NAME,
  env: DEFAULT_ENV,
  waTemplate: DEFAULT_WHATSAPP_TEMPLATE,
  emailSubject: DEFAULT_EMAIL_SUBJECT,
  emailTemplate: DEFAULT_EMAIL_TEMPLATE,
  hasCredentials: false,
};

export async function GET() {
  const { session, response } = await requireAppSession();
  if (response || !session) {
    return response;
  }

  try {
    if (!hasDatabase()) {
      return NextResponse.json(await getLocalSettings(session.user.organizationId));
    }

    const sql = await requireDb();
    const rows = (await sql`
      SELECT
        organizations.name,
        organizations.morning_env,
        organizations.wa_template,
        organizations.email_subject,
        organizations.email_template,
        organization_secrets.organization_id AS has_credentials
      FROM organizations
      LEFT JOIN organization_secrets
        ON organization_secrets.organization_id = organizations.id
      WHERE organizations.id = ${session.user.organizationId}
      LIMIT 1
    `) as Array<{
      name: string;
      morning_env: string;
      wa_template: string;
      email_subject: string;
      email_template: string;
      has_credentials: string | null;
    }>;

    const row = rows[0];
    if (!row) {
      return NextResponse.json(DEFAULT_SETTINGS);
    }

    return NextResponse.json({
      businessName: row.name,
      env: row.morning_env,
      waTemplate: row.wa_template,
      emailSubject: row.email_subject,
      emailTemplate: row.email_template,
      hasCredentials: Boolean(row.has_credentials),
    } satisfies SettingsPayload);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load settings" },
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
    const body = (await req.json()) as Partial<SettingsPayload>;

    if (!hasDatabase()) {
      await saveLocalSettings(session.user.organizationId, body);
      return NextResponse.json({ success: true, storage: "local" });
    }

    const sql = await requireDb();

    await sql`
      UPDATE organizations
      SET
        name = ${body.businessName ?? DEFAULT_BUSINESS_NAME},
        morning_env = ${body.env ?? DEFAULT_ENV},
        wa_template = ${body.waTemplate ?? DEFAULT_WHATSAPP_TEMPLATE},
        email_subject = ${body.emailSubject ?? DEFAULT_EMAIL_SUBJECT},
        email_template = ${body.emailTemplate ?? DEFAULT_EMAIL_TEMPLATE},
        updated_at = NOW()
      WHERE id = ${session.user.organizationId}
    `;

    return NextResponse.json({ success: true, storage: "database" });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to save settings" },
      { status: 500 },
    );
  }
}

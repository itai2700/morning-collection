import { neon } from "@neondatabase/serverless";
import {
  DEFAULT_BUSINESS_NAME,
  DEFAULT_EMAIL_SUBJECT,
  DEFAULT_EMAIL_TEMPLATE,
  DEFAULT_ENV,
  DEFAULT_ORGANIZATION_ID,
  DEFAULT_WHATSAPP_TEMPLATE,
} from "./constants";

type SqlClient = ReturnType<typeof neon>;

let schemaReady: Promise<void> | null = null;

export function getDb(): SqlClient | null {
  const url = process.env.DATABASE_URL;
  if (!url) {
    return null;
  }

  return neon(url);
}

export async function ensureSchema() {
  const sql = getDb();
  if (!sql) {
    throw new Error("DATABASE_URL is not configured");
  }

  if (!schemaReady) {
    schemaReady = (async () => {
      await sql`
        CREATE TABLE IF NOT EXISTS organizations (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL DEFAULT ${DEFAULT_BUSINESS_NAME},
          morning_env TEXT NOT NULL DEFAULT ${DEFAULT_ENV},
          wa_template TEXT NOT NULL DEFAULT ${DEFAULT_WHATSAPP_TEMPLATE},
          email_subject TEXT NOT NULL DEFAULT ${DEFAULT_EMAIL_SUBJECT},
          email_template TEXT NOT NULL DEFAULT ${DEFAULT_EMAIL_TEMPLATE},
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `;

      await sql`
        CREATE TABLE IF NOT EXISTS organization_secrets (
          organization_id TEXT PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
          morning_api_key_id TEXT NOT NULL,
          morning_api_secret TEXT NOT NULL,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `;

      await sql`
        CREATE TABLE IF NOT EXISTS app_users (
          id TEXT PRIMARY KEY,
          email TEXT UNIQUE NOT NULL,
          name TEXT,
          image TEXT,
          organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `;

      await sql`
        CREATE TABLE IF NOT EXISTS user_preferences (
          user_id TEXT PRIMARY KEY REFERENCES app_users(id) ON DELETE CASCADE,
          theme TEXT NOT NULL DEFAULT 'light',
          active_tab TEXT NOT NULL DEFAULT 'inv',
          active_filter TEXT NOT NULL DEFAULT 'all',
          sort_by TEXT NOT NULL DEFAULT 'overdue',
          search_query TEXT NOT NULL DEFAULT '',
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `;

      await sql`
        CREATE TABLE IF NOT EXISTS reminder_events (
          id BIGSERIAL PRIMARY KEY,
          organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
          user_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
          invoice_id TEXT NOT NULL,
          client_id TEXT NOT NULL,
          channel TEXT NOT NULL,
          recipient TEXT NOT NULL DEFAULT '',
          sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `;

      await sql`
        CREATE TABLE IF NOT EXISTS invoice_metadata (
          organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
          invoice_id TEXT NOT NULL,
          client_id TEXT NOT NULL,
          last_reminder_at TIMESTAMPTZ,
          last_reminder_channel TEXT,
          reminder_count INTEGER NOT NULL DEFAULT 0,
          last_reminder_by_user_id TEXT REFERENCES app_users(id) ON DELETE SET NULL,
          PRIMARY KEY (organization_id, invoice_id)
        )
      `;

      await sql`
        INSERT INTO organizations (id, name, morning_env, wa_template, email_subject, email_template)
        VALUES (
          ${DEFAULT_ORGANIZATION_ID},
          ${DEFAULT_BUSINESS_NAME},
          ${DEFAULT_ENV},
          ${DEFAULT_WHATSAPP_TEMPLATE},
          ${DEFAULT_EMAIL_SUBJECT},
          ${DEFAULT_EMAIL_TEMPLATE}
        )
        ON CONFLICT (id) DO NOTHING
      `;
    })();
  }

  await schemaReady;
}

export async function requireDb() {
  const sql = getDb();
  if (!sql) {
    throw new Error("DATABASE_URL is not configured");
  }

  await ensureSchema();
  return sql;
}

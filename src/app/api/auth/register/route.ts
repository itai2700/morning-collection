import { NextResponse } from "next/server";
import { DEFAULT_BUSINESS_NAME, DEFAULT_ORGANIZATION_ID } from "@/lib/constants";
import { requireDb } from "@/lib/db";
import { createLocalUser } from "@/lib/local-store";
import { hashPassword } from "@/lib/passwords";
import { hasDatabase } from "@/lib/storage";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      email?: string;
      password?: string;
      name?: string;
    };

    const email = body.email?.trim().toLowerCase() ?? "";
    const password = body.password ?? "";
    const name = body.name?.trim() || email;

    if (!email || !password) {
      return NextResponse.json(
        { error: "Email and password are required" },
        { status: 400 },
      );
    }

    if (password.length < 6) {
      return NextResponse.json(
        { error: "Password must be at least 6 characters" },
        { status: 400 },
      );
    }

    const passwordHash = await hashPassword(password);

    if (!hasDatabase()) {
      await createLocalUser({ email, name, passwordHash });
      return NextResponse.json({ success: true, storage: "local" });
    }

    const sql = await requireDb();
    const existing = (await sql`
      SELECT id
      FROM app_users
      WHERE email = ${email}
      LIMIT 1
    `) as Array<{ id: string }>;

    if (existing[0]) {
      return NextResponse.json(
        { error: "A user with this email already exists" },
        { status: 409 },
      );
    }

    await sql`
      INSERT INTO organizations (id, name)
      VALUES (${DEFAULT_ORGANIZATION_ID}, ${DEFAULT_BUSINESS_NAME})
      ON CONFLICT (id) DO NOTHING
    `;

    await sql`
      INSERT INTO app_users (id, email, name, organization_id)
      VALUES (${email}, ${email}, ${name}, ${DEFAULT_ORGANIZATION_ID})
    `;

    await sql`
      INSERT INTO user_auth_credentials (user_id, password_hash)
      VALUES (${email}, ${passwordHash})
    `;

    await sql`
      INSERT INTO user_preferences (user_id)
      VALUES (${email})
      ON CONFLICT (user_id) DO NOTHING
    `;

    return NextResponse.json({ success: true, storage: "database" });
  } catch (error) {
    const status =
      error instanceof Error && error.message === "A user with this email already exists"
        ? 409
        : 500;

    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to register user",
      },
      { status },
    );
  }
}

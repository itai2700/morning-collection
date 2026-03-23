import { NextResponse } from "next/server";
import { requireDb } from "@/lib/db";
import { getLocalUserPreferences, saveLocalUserPreferences } from "@/lib/local-store";
import { requireAppSession } from "@/lib/session";
import { hasDatabase } from "@/lib/storage";
import type { UserPreferences } from "@/lib/types";

const DEFAULT_PREFERENCES: UserPreferences = {
  theme: "light",
  activeTab: "inv",
  activeFilter: "all",
  sortBy: "overdue",
  searchQuery: "",
};

export async function GET() {
  const { session, response } = await requireAppSession();
  if (response || !session) {
    return response;
  }

  try {
    if (!hasDatabase()) {
      return NextResponse.json(await getLocalUserPreferences(session.user.id));
    }

    const sql = await requireDb();
    const rows = (await sql`
      SELECT theme, active_tab, active_filter, sort_by, search_query
      FROM user_preferences
      WHERE user_id = ${session.user.id}
      LIMIT 1
    `) as Array<{
      theme: string;
      active_tab: string;
      active_filter: string;
      sort_by: string;
      search_query: string;
    }>;

    const row = rows[0];
    if (!row) {
      return NextResponse.json(DEFAULT_PREFERENCES);
    }

    return NextResponse.json({
      theme: row.theme === "dark" ? "dark" : "light",
      activeTab: row.active_tab,
      activeFilter: row.active_filter,
      sortBy: row.sort_by,
      searchQuery: row.search_query,
    } satisfies UserPreferences);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load preferences" },
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
    const body = (await req.json()) as Partial<UserPreferences>;

    if (!hasDatabase()) {
      await saveLocalUserPreferences(session.user.id, body);
      return NextResponse.json({ success: true, storage: "local" });
    }

    const sql = await requireDb();

    await sql`
      INSERT INTO user_preferences (user_id, theme, active_tab, active_filter, sort_by, search_query)
      VALUES (
        ${session.user.id},
        ${body.theme ?? DEFAULT_PREFERENCES.theme},
        ${body.activeTab ?? DEFAULT_PREFERENCES.activeTab},
        ${body.activeFilter ?? DEFAULT_PREFERENCES.activeFilter},
        ${body.sortBy ?? DEFAULT_PREFERENCES.sortBy},
        ${body.searchQuery ?? DEFAULT_PREFERENCES.searchQuery}
      )
      ON CONFLICT (user_id) DO UPDATE SET
        theme = EXCLUDED.theme,
        active_tab = EXCLUDED.active_tab,
        active_filter = EXCLUDED.active_filter,
        sort_by = EXCLUDED.sort_by,
        search_query = EXCLUDED.search_query,
        updated_at = NOW()
    `;

    return NextResponse.json({ success: true, storage: "database" });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to save preferences" },
      { status: 500 },
    );
  }
}

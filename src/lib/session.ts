import { NextResponse } from "next/server";
import { auth } from "./auth";

export async function requireAppSession() {
  const session = await auth();

  if (!session?.user?.email || !session.user.id || !session.user.organizationId) {
    return {
      session: null,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  return {
    session,
    response: null,
  };
}

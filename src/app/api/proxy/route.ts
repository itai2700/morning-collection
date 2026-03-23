import { NextRequest, NextResponse } from "next/server";
import { morningRequest } from "@/lib/morning";
import { requireAppSession } from "@/lib/session";

export async function POST(req: NextRequest) {
  const { session, response } = await requireAppSession();
  if (response || !session) {
    return response;
  }

  const { searchParams } = new URL(req.url);
  const endpoint = searchParams.get("endpoint");

  if (!endpoint) {
    return NextResponse.json({ error: "Missing endpoint" }, { status: 400 });
  }

  try {
    const body = await req.json();
    const data = await morningRequest({
      organizationId: session.user.organizationId,
      endpoint,
      body,
    });

    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Proxy request failed" },
      { status: 500 },
    );
  }
}

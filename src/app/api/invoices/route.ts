import { NextResponse } from "next/server";
import { morningRequest } from "@/lib/morning";
import { requireDb } from "@/lib/db";
import { getLocalInvoiceMetadata } from "@/lib/local-store";
import { requireAppSession } from "@/lib/session";
import { hasDatabase } from "@/lib/storage";
import type { Client, Invoice } from "@/lib/types";

function mapInvoice(item: Record<string, unknown>): Invoice {
  const client = (item.client as Record<string, unknown> | undefined) ?? {};
  const recipient = (item.recipient as Record<string, unknown> | undefined) ?? {};
  const url = (item.url as Record<string, unknown> | undefined) ?? {};
  const files = (item.files as Record<string, unknown> | undefined) ?? {};
  const downloadLinks = (files.downloadLinks as Record<string, unknown> | undefined) ?? {};

  return {
    id: String(item.id ?? ""),
    num: (item.number as number | string | undefined) ?? "",
    type: Number(item.type ?? 0),
    cid: String(client.id ?? item.clientId ?? ""),
    name: String(client.name ?? recipient.name ?? "לקוח"),
    email: String((client.emails as string[] | undefined)?.[0] ?? (recipient.emails as string[] | undefined)?.[0] ?? ""),
    phone: String(client.phone ?? recipient.phone ?? ""),
    amt: Number(item.total ?? item.totalAmount ?? 0),
    date: String(item.date ?? item.documentDate ?? ""),
    due: String(item.dueDate ?? ""),
    purl: String(url.origin ?? item.paymentUrl ?? ""),
    durl: String(downloadLinks.he ?? ""),
  };
}

function mapClient(item: Record<string, unknown>): Client {
  return {
    id: String(item.id ?? ""),
    name: String(item.name ?? ""),
    email: String((item.emails as string[] | undefined)?.[0] ?? ""),
    phone: String(item.phone ?? ""),
    tax: String(item.taxId ?? ""),
    city: String(item.city ?? ""),
    pt: (item.paymentTerms as string | number | undefined) ?? "",
  };
}

export async function GET() {
  const { session, response } = await requireAppSession();
  if (response || !session) {
    return response;
  }

  try {
    const invoicesResponse = await morningRequest<{ items?: Record<string, unknown>[] }>({
      organizationId: session.user.organizationId,
      endpoint: "documents/search",
      body: {
        page: 1,
        pageSize: 50,
        type: [300, 305, 320],
        status: [0],
      },
    });

    const clientsResponse = await morningRequest<{ items?: Record<string, unknown>[] }>({
      organizationId: session.user.organizationId,
      endpoint: "clients/search",
      body: {
        page: 1,
        pageSize: 50,
        active: true,
      },
    });

    const invoices = (invoicesResponse.items ?? []).map(mapInvoice);
    const clients = (clientsResponse.items ?? []).map(mapClient);

    const clientMap = new Map(clients.map((client) => [client.id, client]));
    invoices.forEach((invoice) => {
      const client = clientMap.get(invoice.cid);
      if (!client) {
        return;
      }

      if (!invoice.email) {
        invoice.email = client.email;
      }

      if (!invoice.phone) {
        invoice.phone = client.phone;
      }
    });

    const metadataRows = hasDatabase()
      ? ((await (await requireDb())`
          SELECT invoice_id, last_reminder_at, last_reminder_channel, reminder_count
          FROM invoice_metadata
          WHERE organization_id = ${session.user.organizationId}
        `) as Array<{
          invoice_id: string;
          last_reminder_at: string | null;
          last_reminder_channel: "whatsapp" | "email" | null;
          reminder_count: number;
        }>)
      : await getLocalInvoiceMetadata(session.user.organizationId);

    const metadataByInvoice = new Map(
      metadataRows.map((row) => [
        row.invoice_id as string,
        {
          lastReminderAt: row.last_reminder_at as string | null,
          lastReminderChannel: row.last_reminder_channel as "whatsapp" | "email" | null,
          reminderCount: Number(row.reminder_count ?? 0),
        },
      ]),
    );

    const enrichedInvoices = invoices.map((invoice) => ({
      ...invoice,
      ...metadataByInvoice.get(invoice.id),
    }));

    return NextResponse.json({ invoices: enrichedInvoices, clients });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load invoices" },
      { status: 500 },
    );
  }
}

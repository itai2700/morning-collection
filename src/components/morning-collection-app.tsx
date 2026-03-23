"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { signOut } from "next-auth/react";
import type { Client, Invoice, LogEntry, ReminderEvent, SettingsPayload, UserPreferences } from "@/lib/types";

const DOCUMENT_TYPES: Record<number, string> = {
  300: "חשבון עסקה",
  305: "חשבונית מס",
  320: "מס/קבלה",
  10: "הצעת מחיר",
  100: "הזמנה",
  400: "קבלה",
};

const PAYMENT_TERMS: Record<string, string> = {
  "-1": "מיידי",
  "0": "שוטף",
  "30": "שוטף+30",
  "60": "שוטף+60",
  "90": "שוטף+90",
};

const AVATAR_COLORS = ["a", "b", "c", "d", "e", "f"];

const DEFAULT_SETTINGS: SettingsPayload = {
  businessName: "העסק שלי",
  env: "production",
  waTemplate:
    "שלום {clientName},\n\nפנייה זו מטעם {businessName}.\n\nברצוננו להזכירך כי {invoiceDetails} טרם שולמו.\n\nסה״כ לתשלום: {totalAmount}\n\nקישור לתשלום:\n{paymentLinks}\n\nנודה לטיפולך בהקדם.\nבברכה, {businessName}",
  emailSubject: "תזכורת תשלום — {invoiceDetails} | {businessName}",
  emailTemplate:
    "שלום רב {clientName},\n\nאנו פונים אליך מטעם {businessName} בנוגע לחשבוניות פתוחות:\n\n{invoiceDetails}\n\nסה״כ לתשלום: {totalAmount}\n\nקישורים ישירים:\n{paymentLinks}\n\n{documentLinks}\n\nנודה על הסדרת התשלום בהקדם.\n\nבכבוד רב,\n{businessName}",
  hasCredentials: false,
};

const fm = (n: number) =>
  new Intl.NumberFormat("he-IL", {
    style: "currency",
    currency: "ILS",
    maximumFractionDigits: 0,
  }).format(n);

const fd = (d: string) =>
  d
    ? new Date(d).toLocaleDateString("he-IL", {
        day: "2-digit",
        month: "2-digit",
        year: "2-digit",
      })
    : "—";

const da = (d: string) =>
  d ? Math.floor((Date.now() - new Date(d).getTime()) / 864e5) : 0;

const ac = (i: number) => AVATAR_COLORS[i % 6];

function applyTheme(theme: "light" | "dark") {
  document.documentElement.setAttribute(
    "data-theme",
    theme === "dark" ? "dark" : "white",
  );
}

function mapReminderEventsToLogs(events: ReminderEvent[]): LogEntry[] {
  return events.map((event) => ({
    m: `${event.channel === "whatsapp" ? "WA" : "Mail"} → ${event.recipient || event.clientId}${
      event.sentByName ? ` · ${event.sentByName}` : ""
    }`,
    t: "ok",
    tm: new Date(event.sentAt).toLocaleTimeString("he-IL"),
  }));
}

type Props = {
  user: {
    name?: string | null;
    email?: string | null;
    organizationName: string;
  };
};

export function MorningCollectionApp({ user }: Props) {
  const [isDark, setIsDark] = useState(false);
  const [activeTab, setActiveTab] = useState("inv");
  const [activeFilter, setActiveFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState("overdue");

  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [logs, setLogs] = useState<LogEntry[]>([]);

  const [apiKeyId, setApiKeyId] = useState("");
  const [apiSecret, setApiSecret] = useState("");
  const [businessName, setBusinessName] = useState(DEFAULT_SETTINGS.businessName);
  const [env, setEnv] = useState(DEFAULT_SETTINGS.env);
  const [waTemplate, setWaTemplate] = useState(DEFAULT_SETTINGS.waTemplate);
  const [emailSubject, setEmailSubject] = useState(DEFAULT_SETTINGS.emailSubject);
  const [emailTemplate, setEmailTemplate] = useState(DEFAULT_SETTINGS.emailTemplate);
  const [hasCredentials, setHasCredentials] = useState(false);
  const [isConnected, setIsConnected] = useState(false);

  const [showSettings, setShowSettings] = useState(false);
  const [showReminder, setShowReminder] = useState(false);
  const [showClientDetail, setShowClientDetail] = useState(false);
  const [reminderData, setReminderData] = useState<{
    type: "whatsapp" | "email";
    invs: Invoice[];
  } | null>(null);
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<{
    m: string;
    t: "ok" | "er";
  } | null>(null);
  const [connFeedback, setConnFeedback] = useState<{
    type: string;
    title: string;
    detail: string;
  } | null>(null);
  const [bootstrapError, setBootstrapError] = useState<string | null>(null);
  const [loadingData, setLoadingData] = useState(false);

  const hydratedRef = useRef(false);
  const prefsSaveTimeoutRef = useRef<number | null>(null);

  const clientMap = useMemo(() => {
    return clients.reduce<Record<string, Client>>((acc, client) => {
      acc[client.id] = client;
      return acc;
    }, {});
  }, [clients]);

  const sentInvoices = useMemo(() => {
    return invoices.reduce<Record<string, string>>((acc, invoice) => {
      if (invoice.lastReminderAt) {
        acc[invoice.id] = invoice.lastReminderAt;
      }
      return acc;
    }, {});
  }, [invoices]);

  const toast = (m: string, t: "ok" | "er" = "ok") => {
    setToastMessage({ m, t });
    window.setTimeout(() => setToastMessage(null), 3000);
  };

  const addLog = (m: string, t: "in" | "ok" | "er" = "in") => {
    setLogs((prev) => [
      { m, t, tm: new Date().toLocaleTimeString("he-IL") },
      ...prev,
    ]);
  };

  const loadInvoices = useCallback(async () => {
    if (!hasCredentials) {
      setIsConnected(false);
      setInvoices([]);
      setClients([]);
      return;
    }

    setLoadingData(true);
    try {
      const res = await fetch("/api/invoices");
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "שגיאה בטעינת נתונים");
      }

      setInvoices(data.invoices ?? []);
      setClients(data.clients ?? []);
      setIsConnected(true);
      addLog(`${(data.invoices ?? []).length} חשבוניות נטענו`, "ok");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "שגיאה בטעינת נתונים";
      setIsConnected(false);
      addLog(`שגיאה בטעינה: ${message}`, "er");
      toast(message, "er");
    } finally {
      setLoadingData(false);
    }
  }, [hasCredentials]);

  useEffect(() => {
    let cancelled = false;

    const bootstrap = async () => {
      try {
        const [settingsRes, prefsRes, remindersRes] = await Promise.all([
          fetch("/api/settings"),
          fetch("/api/preferences"),
          fetch("/api/reminders"),
        ]);

        const [settingsData, prefsData, remindersData] = await Promise.all([
          settingsRes.json(),
          prefsRes.json(),
          remindersRes.json(),
        ]);

        if (!settingsRes.ok) {
          throw new Error(settingsData.error || "Failed to load settings");
        }

        if (!prefsRes.ok) {
          throw new Error(prefsData.error || "Failed to load preferences");
        }

        if (!remindersRes.ok) {
          throw new Error(remindersData.error || "Failed to load reminders");
        }

        if (cancelled) {
          return;
        }

        const settings = settingsData as SettingsPayload;
        const prefs = prefsData as UserPreferences;
        const reminders = remindersData.events as ReminderEvent[];

        setBusinessName(settings.businessName);
        setEnv(settings.env);
        setWaTemplate(settings.waTemplate);
        setEmailSubject(settings.emailSubject);
        setEmailTemplate(settings.emailTemplate);
        setHasCredentials(settings.hasCredentials);

        setIsDark(prefs.theme === "dark");
        setActiveTab(prefs.activeTab);
        setActiveFilter(prefs.activeFilter);
        setSortBy(prefs.sortBy);
        setSearchQuery(prefs.searchQuery);
        applyTheme(prefs.theme);

        setLogs(mapReminderEventsToLogs(reminders));
        hydratedRef.current = true;
        setBootstrapError(null);

        if (settings.hasCredentials) {
          void loadInvoices();
        }
      } catch (error) {
        if (cancelled) {
          return;
        }

        const message =
          error instanceof Error ? error.message : "Failed to bootstrap app";
        setBootstrapError(message);
      }
    };

    void bootstrap();

    return () => {
      cancelled = true;
    };
  }, [loadInvoices]);

  useEffect(() => {
    if (!hydratedRef.current) {
      return;
    }

    const nextTheme: "light" | "dark" = isDark ? "dark" : "light";
    applyTheme(nextTheme);

    if (prefsSaveTimeoutRef.current) {
      window.clearTimeout(prefsSaveTimeoutRef.current);
    }

    prefsSaveTimeoutRef.current = window.setTimeout(() => {
      void fetch("/api/preferences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          theme: nextTheme,
          activeTab,
          activeFilter,
          sortBy,
          searchQuery,
        } satisfies UserPreferences),
      });
    }, 350);

    return () => {
      if (prefsSaveTimeoutRef.current) {
        window.clearTimeout(prefsSaveTimeoutRef.current);
      }
    };
  }, [isDark, activeTab, activeFilter, sortBy, searchQuery]);

  const saveSettings = async () => {
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          businessName,
          env,
          waTemplate,
          emailSubject,
          emailTemplate,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "שגיאה בשמירת הגדרות");
      }

      toast("הגדרות העסק נשמרו");
      setShowSettings(false);
    } catch (error) {
      toast(
        error instanceof Error ? error.message : "שגיאה בשמירת הגדרות",
        "er",
      );
    }
  };

  const connect = async () => {
    if (!apiKeyId || !apiSecret) {
      setConnFeedback({
        type: "warn",
        title: "חסרים פרטים",
        detail: "יש להזין מזהה מפתח וסוד.",
      });
      return;
    }

    setConnFeedback({
      type: "loading",
      title: "מחבר את Morning",
      detail: "המערכת בודקת ושומרת את פרטי החיבור בשרת...",
    });

    try {
      const res = await fetch("/api/morning/credentials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKeyId, apiSecret, env }),
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "שגיאת חיבור");
      }

      setConnFeedback({
        type: "success",
        title: "החיבור נשמר",
        detail: "פרטי Morning נשמרו בשרת והמערכת טוענת נתונים.",
      });
      setHasCredentials(true);
      setIsConnected(true);
      setApiSecret("");
      await loadInvoices();
    } catch (error) {
      setConnFeedback({
        type: "error",
        title: "שגיאת חיבור",
        detail: error instanceof Error ? error.message : "שגיאה לא ידועה",
      });
    }
  };

  const loadDemo = () => {
    setInvoices([
      {
        id: "d1",
        num: 1042,
        type: 300,
        cid: "c1",
        name: "סקיאן תכשיטים",
        email: "info@sakian.co.il",
        phone: "052-555-1234",
        amt: 8500,
        date: "2026-01-15",
        due: "2026-02-15",
        purl: "",
        durl: "",
        lastReminderAt: null,
        lastReminderChannel: null,
        reminderCount: 0,
      },
      {
        id: "d2",
        num: 1038,
        type: 305,
        cid: "c2",
        name: "פסקינו",
        email: "office@paskino.co.il",
        phone: "053-555-2345",
        amt: 4200,
        date: "2026-02-01",
        due: "2026-03-01",
        purl: "",
        durl: "",
        lastReminderAt: null,
        lastReminderChannel: null,
        reminderCount: 0,
      },
    ]);
    setClients([
      {
        id: "c1",
        name: "סקיאן תכשיטים",
        email: "info@sakian.co.il",
        phone: "052-555-1234",
        tax: "515123456",
        city: "תל אביב",
        pt: 30,
      },
      {
        id: "c2",
        name: "פסקינו",
        email: "office@paskino.co.il",
        phone: "053-555-2345",
        tax: "515112233",
        city: "רמת גן",
        pt: 0,
      },
    ]);
    setIsConnected(true);
    addLog("מצב דמו הופעל", "in");
    toast("נטען מצב דמו");
  };

  const generateMessage = (type: "whatsapp" | "email", invs: Invoice[]) => {
    const biz = businessName || "העסק";
    const template = type === "whatsapp" ? waTemplate : emailTemplate;
    const name = invs[0]?.name || "לקוח יקר";
    const details = invs
      .map(
        (invoice) =>
          `חשבונית מס׳ ${invoice.num || "—"} ע״ס ${fm(invoice.amt)} מתאריך ${fd(invoice.date)}`,
      )
      .join("\n");
    const total = fm(invs.reduce((sum, invoice) => sum + invoice.amt, 0));
    const paymentLinks = invs
      .map(
        (invoice) =>
          `חשבונית ${invoice.num || ""}: ${invoice.purl || `https://app.morning.co/document/${invoice.id}`}`,
      )
      .join("\n");
    const documentLinks = invs
      .map(
        (invoice) =>
          `צפייה בחשבונית ${invoice.num || ""}: ${invoice.durl || `https://app.morning.co/document/${invoice.id}`}`,
      )
      .join("\n");

    return template
      .replace(/\{clientName\}/g, name)
      .replace(/\{businessName\}/g, biz)
      .replace(/\{invoiceDetails\}/g, details)
      .replace(/\{totalAmount\}/g, total)
      .replace(/\{paymentLinks\}/g, paymentLinks)
      .replace(/\{documentLinks\}/g, documentLinks);
  };

  const recordReminderEvents = async (
    events: Array<{
      invoiceId: string;
      clientId: string;
      channel: "whatsapp" | "email";
      recipient: string;
    }>,
  ) => {
    if (events.length === 0) {
      return;
    }

    const res = await fetch("/api/reminders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ events }),
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || "Failed to record reminders");
    }

    const now = new Date().toISOString();
    setInvoices((prev) =>
      prev.map((invoice) => {
        const matchingEvents = events.filter((event) => event.invoiceId === invoice.id);
        if (matchingEvents.length === 0) {
          return invoice;
        }

        const latestEvent = matchingEvents[matchingEvents.length - 1];
        return {
          ...invoice,
          lastReminderAt: now,
          lastReminderChannel: latestEvent.channel,
          reminderCount: (invoice.reminderCount ?? 0) + matchingEvents.length,
        };
      }),
    );
  };

  const sendGroupedReminders = async (
    type: "whatsapp" | "email",
    invs: Invoice[],
  ) => {
    const byClient: Record<string, Invoice[]> = {};
    invs.forEach((invoice) => {
      const key = invoice.cid || invoice.name;
      (byClient[key] = byClient[key] || []).push(invoice);
    });

    const events: Array<{
      invoiceId: string;
      clientId: string;
      channel: "whatsapp" | "email";
      recipient: string;
    }> = [];

    Object.values(byClient).forEach((clientInvoices) => {
      const firstInvoice = clientInvoices[0];
      if (type === "whatsapp") {
        let phone = firstInvoice.phone.replace(/\D/g, "");
        if (!phone) {
          addLog(`${firstInvoice.name}: חסר טלפון`, "er");
          return;
        }
        if (phone.startsWith("0")) {
          phone = `972${phone.slice(1)}`;
        }

        const message = generateMessage("whatsapp", clientInvoices);
        window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`, "_blank");
        addLog(`WA → ${firstInvoice.name} (${clientInvoices.length})`, "ok");
        clientInvoices.forEach((invoice) => {
          events.push({
            invoiceId: invoice.id,
            clientId: invoice.cid || invoice.name,
            channel: "whatsapp",
            recipient: firstInvoice.name,
          });
        });
        return;
      }

      if (!firstInvoice.email) {
        addLog(`${firstInvoice.name}: חסר מייל`, "er");
        return;
      }

      const body = generateMessage("email", clientInvoices);
      const subject = emailSubject
        .replace(/\{clientName\}/g, firstInvoice.name)
        .replace(/\{businessName\}/g, businessName || "העסק")
        .replace(/\{invoiceDetails\}/g, clientInvoices.map((invoice) => `#${invoice.num}`).join(", "))
        .replace(
          /\{totalAmount\}/g,
          fm(clientInvoices.reduce((sum, invoice) => sum + invoice.amt, 0)),
        );

      window.open(
        `mailto:${firstInvoice.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`,
        "_blank",
      );
      addLog(`Mail → ${firstInvoice.name} (${clientInvoices.length})`, "ok");
      clientInvoices.forEach((invoice) => {
        events.push({
          invoiceId: invoice.id,
          clientId: invoice.cid || invoice.name,
          channel: "email",
          recipient: firstInvoice.name,
        });
      });
    });

    if (events.length === 0) {
      return;
    }

    await recordReminderEvents(events);
    toast(type === "whatsapp" ? "WhatsApp נפתח" : "המייל נפתח");
  };

  const filteredInvoices = useMemo(() => {
    let list = [...invoices];

    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      list = list.filter(
        (invoice) =>
          invoice.name.toLowerCase().includes(query) ||
          String(invoice.num).includes(query) ||
          invoice.email.toLowerCase().includes(query),
      );
    }

    switch (activeFilter) {
      case "overdue":
        list = list.filter((invoice) => da(invoice.due) > 0);
        break;
      case "sent":
        list = list.filter((invoice) => Boolean(invoice.lastReminderAt));
        break;
      case "not-sent":
        list = list.filter((invoice) => !invoice.lastReminderAt);
        break;
      case "current":
        list = list.filter((invoice) => da(invoice.due) <= 30);
        break;
      case "30-60":
        list = list.filter((invoice) => da(invoice.due) > 30 && da(invoice.due) <= 60);
        break;
      case "60-90":
        list = list.filter((invoice) => da(invoice.due) > 60 && da(invoice.due) <= 90);
        break;
      case "90+":
        list = list.filter((invoice) => da(invoice.due) > 90);
        break;
      default:
        break;
    }

    list.sort((a, b) => {
      if (sortBy === "overdue") return da(b.due) - da(a.due);
      if (sortBy === "date-asc") return new Date(a.date).getTime() - new Date(b.date).getTime();
      if (sortBy === "date-desc") return new Date(b.date).getTime() - new Date(a.date).getTime();
      if (sortBy === "amount-desc") return b.amt - a.amt;
      if (sortBy === "amount-asc") return a.amt - b.amt;
      return 0;
    });

    return list;
  }, [activeFilter, invoices, searchQuery, sortBy]);

  const stats = useMemo(() => {
    const totalCount = invoices.length;
    const totalAmount = invoices.reduce((sum, invoice) => sum + invoice.amt, 0);
    const overdueCount = invoices.filter((invoice) => invoice.due && da(invoice.due) > 30).length;
    const clientCount = new Set(invoices.map((invoice) => invoice.cid || invoice.name)).size;
    return { totalCount, totalAmount, overdueCount, clientCount };
  }, [invoices]);

  const agingData = useMemo(() => {
    const counts = [0, 0, 0, 0];
    const amounts = [0, 0, 0, 0];
    invoices.forEach((invoice) => {
      const days = da(invoice.due);
      const index = days <= 30 ? 0 : days <= 60 ? 1 : days <= 90 ? 2 : 3;
      counts[index] += 1;
      amounts[index] += invoice.amt;
    });
    return { counts, amounts };
  }, [invoices]);

  const groupedByClient = useMemo(() => {
    const byClient: Record<string, Invoice[]> = {};
    invoices.forEach((invoice) => {
      const key = invoice.cid || invoice.name;
      (byClient[key] = byClient[key] || []).push(invoice);
    });

    return Object.entries(byClient).sort(
      (a, b) =>
        b[1].reduce((sum, invoice) => sum + invoice.amt, 0) -
        a[1].reduce((sum, invoice) => sum + invoice.amt, 0),
    );
  }, [invoices]);

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredInvoices.length) {
      setSelectedIds(new Set());
      return;
    }

    setSelectedIds(new Set(filteredInvoices.map((invoice) => invoice.id)));
  };

  const toggleSelect = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const next = new Set(selectedIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedIds(next);
  };

  const handleBulkAction = async (type: "whatsapp" | "email") => {
    const selectedInvoices = invoices.filter((invoice) => selectedIds.has(invoice.id));
    await sendGroupedReminders(type, selectedInvoices);
    setSelectedIds(new Set());
  };

  const onboardingVisible = !hasCredentials && invoices.length === 0;

  return (
    <div dir="rtl" className="min-h-screen">
      {toastMessage && (
        <div className="tts">
          <div className={`tt ${toastMessage.t}`}>
            {toastMessage.t === "ok" ? "✓ " : "✕ "}
            {toastMessage.m}
          </div>
        </div>
      )}

      <div className="app">
        <div className="hdr gls">
          <div className="hdr-r">
            <div className="logo">₪</div>
            <div className="hdr-txt">
              <h1>מערכת גבייה</h1>
              <p>{user.organizationName || businessName}</p>
            </div>
          </div>
          <div className="hdr-l" style={{ gap: 10 }}>
            <div className="cbadge">
              <span className={`cdot ${isConnected ? "on" : ""}`}></span>
              <span>{isConnected ? "מחובר" : "לא מחובר"}</span>
            </div>
            <button className="btn bg bxs" onClick={() => setIsDark((prev) => !prev)}>
              {isDark ? "מצב בהיר" : "מצב כהה"}
            </button>
            <button className="ib" onClick={() => setShowSettings(true)}>
              ⚙
            </button>
            <button className="btn bg bxs" onClick={() => signOut()}>
              יציאה
            </button>
          </div>
        </div>

        <div className="gls" style={{ marginBottom: 14, padding: 14, display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
          <div style={{ display: "grid", gap: 4 }}>
            <div style={{ fontWeight: 700 }}>{user.name || user.email}</div>
            <div style={{ color: "var(--t3)", fontSize: 13 }}>{user.email}</div>
          </div>
          <div style={{ display: "grid", gap: 4, textAlign: "left" }}>
            <div style={{ fontWeight: 700 }}>{businessName}</div>
            <div style={{ color: "var(--t3)", fontSize: 13 }}>
              {hasCredentials ? "פרטי Morning שמורים בשרת" : "נדרש חיבור Morning"}
            </div>
          </div>
        </div>

        {bootstrapError && (
          <div className="conn-fb error" style={{ marginBottom: 14 }}>
            <div className="cfb-icon">✕</div>
            <div>
              <div>שגיאת אתחול</div>
              <div className="cfb-steps">{bootstrapError}</div>
            </div>
          </div>
        )}

        {onboardingVisible && (
          <div className="gls" style={{ marginBottom: 14, padding: 18 }}>
            <div style={{ fontWeight: 800, marginBottom: 8 }}>המערכת עדיין לא מחוברת ל-Morning</div>
            <div style={{ color: "var(--t3)", lineHeight: 1.6, marginBottom: 12 }}>
              יש להגדיר את פרטי ה-API פעם אחת. הפרטים נשמרים בצד השרת בלבד, ולא חוזרים לקליינט.
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button className="btn bp bs" onClick={() => setShowSettings(true)}>
                פתח הגדרות חיבור
              </button>
              <button className="btn bg bs" onClick={loadDemo}>
                טען דמו
              </button>
            </div>
          </div>
        )}

        <div className="qa">
          <button className="qa-btn send-all" onClick={() => void sendGroupedReminders("whatsapp", invoices.filter((invoice) => da(invoice.due) > 30))}>
            תזכר איחור 30+
          </button>
          <button className="qa-btn wa-all" onClick={() => void sendGroupedReminders("whatsapp", invoices.filter((invoice) => invoice.phone))}>
            WhatsApp לכולם
          </button>
          <button className="qa-btn refresh" onClick={() => void loadInvoices()}>
            {loadingData ? "טוען..." : "רענן נתונים"}
          </button>
          <button className="qa-btn refresh" onClick={() => setActiveTab("grp")}>
            קבץ לפי לקוח
          </button>
        </div>

        <div className="stats">
          <div className={`st gl bl ${activeFilter === "all" ? "active" : ""}`} onClick={() => {
            setActiveTab("inv");
            setActiveFilter("all");
          }}>
            <div className="st-lbl">פתוחות</div>
            <div className="st-val">{stats.totalCount || "—"}</div>
          </div>
          <div className="st gl or">
            <div className="st-lbl">סה״כ לגבייה</div>
            <div className="st-val">{fm(stats.totalAmount) || "—"}</div>
          </div>
          <div className={`st gl rd ${activeFilter === "overdue" ? "active" : ""}`} onClick={() => {
            setActiveTab("inv");
            setActiveFilter("overdue");
          }}>
            <div className="st-lbl">באיחור 30+</div>
            <div className="st-val">{stats.overdueCount || "—"}</div>
          </div>
          <div className="st gl pu" onClick={() => setActiveTab("cli")}>
            <div className="st-lbl">לקוחות חייבים</div>
            <div className="st-val">{stats.clientCount || "—"}</div>
          </div>
        </div>

        <div className="aging gl">
          <div className="aging-title">התפלגות גיל חוב</div>
          <div className="aging-bar">
            {agingData.counts.map((count, index) => (
              <div
                key={index}
                className="aging-seg"
                style={{
                  width: `${(count / (invoices.length || 1)) * 100}%`,
                  background: ["var(--green)", "var(--orange)", "var(--red)", "var(--purple)"][index],
                }}
              />
            ))}
          </div>
          <div className="aging-legend">
            {[
              { label: "שוטף", filter: "current", color: "var(--green)" },
              { label: "30–60", filter: "30-60", color: "var(--orange)" },
              { label: "60–90", filter: "60-90", color: "var(--red)" },
              { label: "90+", filter: "90+", color: "var(--purple)" },
            ].map((bucket, index) => (
              <div key={bucket.filter} className="aging-item" onClick={() => {
                setActiveTab("inv");
                setActiveFilter(bucket.filter);
              }}>
                <div className="aging-dot" style={{ background: bucket.color }}></div>
                {bucket.label}: {agingData.counts[index]} ({fm(agingData.amounts[index])})
              </div>
            ))}
          </div>
        </div>

        <div className="nav">
          <button className={`nb ${activeTab === "inv" ? "on" : ""}`} onClick={() => setActiveTab("inv")}>
            חשבוניות
          </button>
          <button className={`nb ${activeTab === "cli" ? "on" : ""}`} onClick={() => setActiveTab("cli")}>
            לקוחות
          </button>
          <button className={`nb ${activeTab === "grp" ? "on" : ""}`} onClick={() => setActiveTab("grp")}>
            לפי לקוח
          </button>
          <button className={`nb ${activeTab === "log" ? "on" : ""}`} onClick={() => setActiveTab("log")}>
            יומן
          </button>
        </div>

        {activeTab === "inv" && (
          <div className="tab">
            <div className="filters">
              <button className={`fc ${activeFilter === "all" ? "on" : ""}`} onClick={() => setActiveFilter("all")}>
                <span className="cnt">{invoices.length}</span>הכל
              </button>
              <button className={`fc ${activeFilter === "overdue" ? "on" : ""}`} onClick={() => setActiveFilter("overdue")}>
                <span className="cnt">{invoices.filter((invoice) => da(invoice.due) > 0).length}</span>באיחור
              </button>
              <button className={`fc ${activeFilter === "not-sent" ? "on" : ""}`} onClick={() => setActiveFilter("not-sent")}>
                <span className="cnt">{invoices.length - Object.keys(sentInvoices).length}</span>לא נשלחה תזכורת
              </button>
              <button className={`fc ${activeFilter === "sent" ? "on" : ""}`} onClick={() => setActiveFilter("sent")}>
                <span className="cnt">{Object.keys(sentInvoices).length}</span>נשלחה תזכורת
              </button>
            </div>
            <div className="tbar">
              <div className="sbox">
                <span className="si">⌕</span>
                <input placeholder="חיפוש..." value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} />
              </div>
              <select className="srt" value={sortBy} onChange={(event) => setSortBy(event.target.value)}>
                <option value="overdue">איחור ↓</option>
                <option value="amount-desc">סכום ↓</option>
                <option value="amount-asc">סכום ↑</option>
                <option value="date-asc">ישן→חדש</option>
                <option value="date-desc">חדש→ישן</option>
              </select>
            </div>
            <div className="sa">
              <label>
                <input
                  type="checkbox"
                  checked={selectedIds.size > 0 && selectedIds.size === filteredInvoices.length}
                  onChange={toggleSelectAll}
                />{" "}
                בחר הכל
              </label>
              <span>
                {selectedIds.size}/{filteredInvoices.length}
              </span>
            </div>
            <div className="cl">
              {filteredInvoices.length === 0 ? (
                <div className="empty">
                  <div className="empty-t">
                    {hasCredentials ? "אין חשבוניות בפילטר הנוכחי" : "יש להגדיר חיבור ל-API"}
                  </div>
                  {!hasCredentials && <div className="empty-h">לחץ על גלגל השיניים להזנת פרטי חיבור</div>}
                </div>
              ) : (
                filteredInvoices.map((invoice, index) => {
                  const overdueDays = da(invoice.due);
                  const isOverdue = overdueDays > 0;
                  return (
                    <div
                      key={invoice.id}
                      className={`ic gl ${selectedIds.has(invoice.id) ? "sel" : ""}`}
                      onClick={(event) => toggleSelect(invoice.id, event)}
                    >
                      <div className="ic-top">
                        <div className="ic-cl">
                          <div className={`av ${ac(index)}`}>{invoice.name.charAt(0)}</div>
                          <div style={{ minWidth: 0 }}>
                            <div className="ic-nm">{invoice.name}</div>
                            <div className="ic-mt">
                              {invoice.phone && <span>{invoice.phone}</span>}
                              {invoice.email && <span>{invoice.email}</span>}
                            </div>
                          </div>
                        </div>
                        <div className="ic-am">{fm(invoice.amt)}</div>
                      </div>
                      <div className="ic-mid">
                        <span className="ch ch-n">#{invoice.num || "—"}</span>
                        <span className="ch ch-t">{DOCUMENT_TYPES[invoice.type] || invoice.type}</span>
                        <span className="ch ch-d">{fd(invoice.date)}</span>
                        {isOverdue ? (
                          <span className="ch ch-od">{overdueDays} ימי איחור</span>
                        ) : invoice.due ? (
                          <span className="ch ch-op">עד {fd(invoice.due)}</span>
                        ) : (
                          <span className="ch ch-op">פתוחה</span>
                        )}
                        {invoice.lastReminderAt && (
                          <span className="ch ch-sent">נשלחה {fd(invoice.lastReminderAt)}</span>
                        )}
                      </div>
                      <div className="ic-bot" onClick={(event) => event.stopPropagation()}>
                        <button
                          className="btn bw bs bpl"
                          onClick={() => {
                            setReminderData({ type: "whatsapp", invs: [invoice] });
                            setShowReminder(true);
                          }}
                          disabled={!invoice.phone}
                        >
                          WhatsApp
                        </button>
                        <button
                          className="btn bm bs bpl"
                          onClick={() => {
                            setReminderData({ type: "email", invs: [invoice] });
                            setShowReminder(true);
                          }}
                          disabled={!invoice.email}
                        >
                          מייל
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {activeTab === "cli" && (
          <div className="tab">
            <div className="tbar">
              <div className="sbox">
                <span className="si">⌕</span>
                <input
                  placeholder="חיפוש לקוח..."
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                />
              </div>
            </div>
            <div className="cl">
              {clients
                .filter((client) => client.name.toLowerCase().includes(searchQuery.toLowerCase()))
                .map((client, index) => {
                  const clientInvoices = invoices.filter((invoice) => invoice.cid === client.id);
                  const debt = clientInvoices.reduce((sum, invoice) => sum + invoice.amt, 0);
                  return (
                    <div key={client.id} className="cc gl" onClick={() => {
                      setSelectedClientId(client.id);
                      setShowClientDetail(true);
                    }}>
                      <div className="cc-top">
                        <div className="cc-r">
                          <div className={`av ${ac(index)}`}>{client.name.charAt(0)}</div>
                          <div style={{ minWidth: 0 }}>
                            <div className="ic-nm">{client.name}</div>
                            <div className="ic-mt">
                              <span>{clientInvoices.length} חשבוניות פתוחות</span>
                            </div>
                          </div>
                        </div>
                        <div className={`cc-debt ${debt > 0 ? "y" : "n"}`}>{debt > 0 ? fm(debt) : "✓"}</div>
                      </div>
                      <div className="cc-det">
                        <div className="cc-f">
                          מייל: <span>{client.email || "—"}</span>
                        </div>
                        <div className="cc-f">
                          טלפון: <span>{client.phone || "—"}</span>
                        </div>
                        <div className="cc-f">
                          ח.פ: <span>{client.tax || "—"}</span>
                        </div>
                        <div className="cc-f">
                          עיר: <span>{client.city || "—"}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        )}

        {activeTab === "grp" && (
          <div className="tab">
            <div className="cl grouped">
              {groupedByClient.map(([clientId, clientInvoices], index) => {
                const total = clientInvoices.reduce((sum, invoice) => sum + invoice.amt, 0);
                const firstInvoice = clientInvoices[0];
                return (
                  <React.Fragment key={clientId}>
                    <div className="grp-hdr gls">
                      <div className="grp-name">
                        <div className={`av ${ac(index)}`} style={{ width: 28, height: 28, fontSize: 12 }}>
                          {firstInvoice.name.charAt(0)}
                        </div>
                        {firstInvoice.name}{" "}
                        <span style={{ fontWeight: 400, color: "var(--t3)", fontSize: 12 }}>
                          ({clientInvoices.length})
                        </span>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <div className="grp-total">{fm(total)}</div>
                        <div className="grp-acts">
                          {firstInvoice.phone && (
                            <button className="btn bw bxs" onClick={() => void sendGroupedReminders("whatsapp", clientInvoices)}>
                              WA
                            </button>
                          )}
                          {firstInvoice.email && (
                            <button className="btn bm bxs" onClick={() => void sendGroupedReminders("email", clientInvoices)}>
                              מייל
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                    {clientInvoices.map((invoice) => (
                      <div
                        key={invoice.id}
                        className="gl"
                        style={{
                          borderRadius: "0 0 var(--r2) var(--r2)",
                          padding: "8px 14px",
                          marginBottom: 1,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                        }}
                      >
                        <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                          <span className="ch ch-n">#{invoice.num}</span>
                          <span className="ch ch-d">{fd(invoice.date)}</span>
                          {da(invoice.due) > 0 && <span className="ch ch-od">{da(invoice.due)} יום</span>}
                        </div>
                        <span style={{ fontSize: 14, fontWeight: 700, direction: "ltr" }}>{fm(invoice.amt)}</span>
                      </div>
                    ))}
                  </React.Fragment>
                );
              })}
            </div>
          </div>
        )}

        {activeTab === "log" && (
          <div className="tab">
            <div className="gl" style={{ borderRadius: "var(--r3)", padding: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <h3 style={{ fontSize: 14, fontWeight: 700 }}>יומן תזכורות</h3>
                <button className="btn bg bxs" onClick={() => setLogs([])}>
                  נקה
                </button>
              </div>
              <div className="lg">
                {logs.length === 0 ? (
                  <div className="lg-l in">עדיין לא נשלחו תזכורות.</div>
                ) : (
                  logs.map((log, index) => (
                    <div key={`${log.tm}-${index}`} className={`lg-l ${log.t}`}>
                      [{log.tm}] {log.m}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        <div className={`bb gls ${selectedIds.size > 0 ? "show" : ""}`}>
          <span className="bb-c">{selectedIds.size} נבחרו</span>
          <button className="btn bw bs" onClick={() => void handleBulkAction("whatsapp")}>
            WhatsApp
          </button>
          <button className="btn bm bs" onClick={() => void handleBulkAction("email")}>
            מייל
          </button>
          <button className="btn bg bs" onClick={() => setSelectedIds(new Set())}>
            ✕
          </button>
        </div>

        <div className={`ov ${showSettings ? "show" : ""}`} onClick={() => setShowSettings(false)}>
          <div className="sh gls" onClick={(event) => event.stopPropagation()}>
            <div className="sh-handle"></div>
            <div className="sh-hdr">
              <h3>הגדרות</h3>
              <button className="sh-x" onClick={() => setShowSettings(false)}>
                ✕
              </button>
            </div>
            <div className="sh-bd">
              <div className="slbl">חיבור ל-Morning API</div>
              {hasCredentials && (
                <div className="conn-fb success" style={{ marginBottom: 12 }}>
                  <div className="cfb-icon">✓</div>
                  <div>
                    <div>קיימים פרטי Morning שמורים בשרת</div>
                    <div className="cfb-steps">הזן פרטים חדשים רק אם ברצונך להחליף את החיבור.</div>
                  </div>
                </div>
              )}
              <div className="fld">
                <label>API KEY ID</label>
                <input value={apiKeyId} onChange={(event) => setApiKeyId(event.target.value)} placeholder="מזהה מפתח" />
              </div>
              <div className="fld" style={{ marginTop: 6 }}>
                <label>API SECRET</label>
                <input
                  type="password"
                  value={apiSecret}
                  onChange={(event) => setApiSecret(event.target.value)}
                  placeholder="מפתח סודי"
                />
              </div>
              <div className="fld" style={{ marginTop: 6 }}>
                <label>סביבה</label>
                <select value={env} onChange={(event) => setEnv(event.target.value)}>
                  <option value="production">Production</option>
                  <option value="sandbox">Sandbox</option>
                </select>
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                <button className="btn bp bs" onClick={() => void connect()} style={{ flex: 1 }}>
                  בדוק ושמור חיבור
                </button>
                <button className="btn bg bs" onClick={loadDemo}>
                  דמו
                </button>
              </div>

              {connFeedback && (
                <div style={{ marginTop: 12 }}>
                  <div className={`conn-fb ${connFeedback.type}`}>
                    <div className="cfb-icon">
                      {connFeedback.type === "loading"
                        ? "…"
                        : connFeedback.type === "success"
                          ? "✓"
                          : "✕"}
                    </div>
                    <div>
                      <div>{connFeedback.title}</div>
                      <div className="cfb-steps">{connFeedback.detail}</div>
                    </div>
                  </div>
                </div>
              )}

              <div style={{ height: 1, background: "var(--brd)", margin: "18px 0" }}></div>
              <div className="slbl">שם העסק</div>
              <div className="fld">
                <input
                  value={businessName}
                  onChange={(event) => setBusinessName(event.target.value)}
                  style={{ direction: "rtl", textAlign: "right" }}
                />
              </div>

              <div className="slbl" style={{ marginTop: 16 }}>
                תבנית WhatsApp
              </div>
              <textarea className="tmpl" value={waTemplate} onChange={(event) => setWaTemplate(event.target.value)} />

              <div className="slbl" style={{ marginTop: 16 }}>
                נושא מייל
              </div>
              <div className="fld">
                <input
                  value={emailSubject}
                  onChange={(event) => setEmailSubject(event.target.value)}
                  style={{ direction: "rtl", textAlign: "right" }}
                />
              </div>

              <div className="slbl" style={{ marginTop: 10 }}>
                תוכן מייל
              </div>
              <textarea
                className="tmpl"
                style={{ minHeight: 150 }}
                value={emailTemplate}
                onChange={(event) => setEmailTemplate(event.target.value)}
              />
            </div>
            <div className="sh-ft">
              <button className="btn bp" onClick={() => void saveSettings()}>
                שמור
              </button>
            </div>
          </div>
        </div>

        <div className={`ov ${showReminder ? "show" : ""}`} onClick={() => setShowReminder(false)}>
          <div className="sh gls" onClick={(event) => event.stopPropagation()}>
            <div className="sh-handle"></div>
            <div className="sh-hdr">
              <h3>{reminderData?.type === "whatsapp" ? "תזכורת WhatsApp" : "תזכורת מייל"}</h3>
              <button className="sh-x" onClick={() => setShowReminder(false)}>
                ✕
              </button>
            </div>
            <div className="sh-bd">
              {reminderData && (
                <>
                  <div className="mcli">
                    <div className="av a" style={{ width: 32, height: 32, fontSize: 13 }}>
                      {reminderData.invs[0].name.charAt(0)}
                    </div>
                    <div>
                      <div className="mcli-n">{reminderData.invs[0].name}</div>
                      <div className="mcli-s">
                        {reminderData.type === "whatsapp"
                          ? reminderData.invs[0].phone
                          : reminderData.invs[0].email}
                      </div>
                    </div>
                  </div>
                  <div className="slbl">תצוגה מקדימה</div>
                  <div className="msg-pre">{generateMessage(reminderData.type, reminderData.invs)}</div>
                </>
              )}
            </div>
            <div className="sh-ft">
              {reminderData?.type === "whatsapp" ? (
                <button
                  className="btn bw"
                  onClick={async () => {
                    if (!reminderData) {
                      return;
                    }
                    await sendGroupedReminders("whatsapp", reminderData.invs);
                    setShowReminder(false);
                  }}
                >
                  שלח ב-WhatsApp
                </button>
              ) : (
                <button
                  className="btn bm"
                  onClick={async () => {
                    if (!reminderData) {
                      return;
                    }
                    await sendGroupedReminders("email", reminderData.invs);
                    setShowReminder(false);
                  }}
                >
                  שלח במייל
                </button>
              )}
            </div>
          </div>
        </div>

        <div className={`ov ${showClientDetail ? "show" : ""}`} onClick={() => setShowClientDetail(false)}>
          <div className="sh gls" onClick={(event) => event.stopPropagation()}>
            <div className="sh-handle"></div>
            <div className="sh-hdr">
              <h3>לקוח</h3>
              <button className="sh-x" onClick={() => setShowClientDetail(false)}>
                ✕
              </button>
            </div>
            <div className="sh-bd">
              {selectedClientId && clientMap[selectedClientId] && (
                <>
                  <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
                    <div className="av a" style={{ width: 44, height: 44, fontSize: 18 }}>
                      {clientMap[selectedClientId].name.charAt(0)}
                    </div>
                    <div>
                      <div style={{ fontSize: 16, fontWeight: 700 }}>{clientMap[selectedClientId].name}</div>
                      <div style={{ fontSize: 12, color: "var(--t3)" }}>
                        {clientMap[selectedClientId].city || ""} · {clientMap[selectedClientId].tax || ""}
                      </div>
                    </div>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 14 }}>
                    <div className="gl" style={{ borderRadius: "var(--r2)", padding: 10, textAlign: "center" }}>
                      <div style={{ fontSize: 10, color: "var(--t3)", fontWeight: 600 }}>סה״כ חוב</div>
                      <div style={{ fontSize: 20, fontWeight: 800, color: "var(--red)", direction: "ltr" }}>
                        {fm(
                          invoices
                            .filter((invoice) => invoice.cid === selectedClientId)
                            .reduce((sum, invoice) => sum + invoice.amt, 0),
                        )}
                      </div>
                    </div>
                    <div className="gl" style={{ borderRadius: "var(--r2)", padding: 10, textAlign: "center" }}>
                      <div style={{ fontSize: 10, color: "var(--t3)", fontWeight: 600 }}>פתוחות</div>
                      <div style={{ fontSize: 20, fontWeight: 800, color: "var(--blue)" }}>
                        {invoices.filter((invoice) => invoice.cid === selectedClientId).length}
                      </div>
                    </div>
                  </div>
                  <div className="slbl">פרטי קשר</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginBottom: 14 }}>
                    <div className="cc-f">
                      מייל: <span>{clientMap[selectedClientId].email || "—"}</span>
                    </div>
                    <div className="cc-f">
                      טלפון: <span>{clientMap[selectedClientId].phone || "—"}</span>
                    </div>
                    <div className="cc-f">
                      תנאי תשלום:{" "}
                      <span>{PAYMENT_TERMS[String(clientMap[selectedClientId].pt)] || clientMap[selectedClientId].pt}</span>
                    </div>
                  </div>
                  <div className="slbl">רשימת חשבוניות</div>
                  {invoices
                    .filter((invoice) => invoice.cid === selectedClientId)
                    .map((invoice) => (
                      <div
                        key={invoice.id}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          padding: "8px 0",
                          borderBottom: ".5px solid var(--brd)",
                        }}
                      >
                        <div>
                          <span className="ch ch-n">#{invoice.num}</span>{" "}
                          <span className="ch ch-d">{fd(invoice.date)}</span>{" "}
                          {da(invoice.due) > 0 && <span className="ch ch-od">{da(invoice.due)} יום</span>}
                        </div>
                        <span style={{ fontWeight: 700, direction: "ltr" }}>{fm(invoice.amt)}</span>
                      </div>
                    ))}
                </>
              )}
            </div>
            <div className="sh-ft">
              <button
                className="btn bw"
                onClick={async () => {
                  if (!selectedClientId) {
                    return;
                  }
                  await sendGroupedReminders(
                    "whatsapp",
                    invoices.filter((invoice) => invoice.cid === selectedClientId),
                  );
                  setShowClientDetail(false);
                }}
              >
                שלח הכל ב-WhatsApp
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

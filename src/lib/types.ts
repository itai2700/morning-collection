export interface Invoice {
  id: string;
  num: number | string;
  type: number;
  cid: string;
  name: string;
  email: string;
  phone: string;
  amt: number;
  date: string;
  due: string;
  purl: string;
  durl: string;
  lastReminderAt?: string | null;
  lastReminderChannel?: "whatsapp" | "email" | null;
  reminderCount?: number;
}

export interface Client {
  id: string;
  name: string;
  email: string;
  phone: string;
  tax: string;
  city: string;
  pt: number | string;
}

export interface LogEntry {
  m: string;
  t: "in" | "ok" | "er";
  tm: string;
}

export interface UserPreferences {
  theme: "light" | "dark";
  activeTab: string;
  activeFilter: string;
  sortBy: string;
  searchQuery: string;
}

export interface SettingsPayload {
  businessName: string;
  env: string;
  waTemplate: string;
  emailSubject: string;
  emailTemplate: string;
  hasCredentials: boolean;
}

export interface ReminderEvent {
  id: number;
  invoiceId: string;
  clientId: string;
  channel: "whatsapp" | "email";
  recipient: string;
  sentAt: string;
  sentByName: string | null;
}

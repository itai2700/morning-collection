import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import {
  DEFAULT_BUSINESS_NAME,
  DEFAULT_EMAIL_SUBJECT,
  DEFAULT_EMAIL_TEMPLATE,
  DEFAULT_ENV,
  DEFAULT_ORGANIZATION_ID,
  DEFAULT_WHATSAPP_TEMPLATE,
} from "./constants";
import type { ReminderEvent, SettingsPayload, UserPreferences } from "./types";

type LocalState = {
  organizations: Record<
    string,
    {
      id: string;
      name: string;
      morningEnv: string;
      waTemplate: string;
      emailSubject: string;
      emailTemplate: string;
      createdAt: string;
      updatedAt: string;
    }
  >;
  organizationSecrets: Record<
    string,
    {
      organizationId: string;
      morningApiKeyId: string;
      morningApiSecret: string;
      updatedAt: string;
    }
  >;
  appUsers: Record<
    string,
    {
      id: string;
      email: string;
      name: string | null;
      image: string | null;
      organizationId: string;
      createdAt: string;
      updatedAt: string;
    }
  >;
  userAuthCredentials: Record<
    string,
    {
      userId: string;
      passwordHash: string;
      createdAt: string;
      updatedAt: string;
    }
  >;
  userPreferences: Record<
    string,
    {
      userId: string;
      theme: "light" | "dark";
      activeTab: string;
      activeFilter: string;
      sortBy: string;
      searchQuery: string;
      updatedAt: string;
    }
  >;
  reminderEvents: Array<{
    id: number;
    organizationId: string;
    userId: string;
    invoiceId: string;
    clientId: string;
    channel: "whatsapp" | "email";
    recipient: string;
    sentAt: string;
  }>;
  invoiceMetadata: Record<
    string,
    {
      organizationId: string;
      invoiceId: string;
      clientId: string;
      lastReminderAt: string | null;
      lastReminderChannel: "whatsapp" | "email" | null;
      reminderCount: number;
      lastReminderByUserId: string | null;
    }
  >;
  nextReminderEventId: number;
};

const STORE_DIR = path.join(process.cwd(), ".data");
const STORE_PATH = path.join(STORE_DIR, "local-db.json");

const DEFAULT_PREFERENCES: UserPreferences = {
  theme: "light",
  activeTab: "inv",
  activeFilter: "all",
  sortBy: "overdue",
  searchQuery: "",
};

function createDefaultState(): LocalState {
  const now = new Date().toISOString();

  return {
    organizations: {
      [DEFAULT_ORGANIZATION_ID]: {
        id: DEFAULT_ORGANIZATION_ID,
        name: DEFAULT_BUSINESS_NAME,
        morningEnv: DEFAULT_ENV,
        waTemplate: DEFAULT_WHATSAPP_TEMPLATE,
        emailSubject: DEFAULT_EMAIL_SUBJECT,
        emailTemplate: DEFAULT_EMAIL_TEMPLATE,
        createdAt: now,
        updatedAt: now,
      },
    },
    organizationSecrets: {},
    appUsers: {},
    userAuthCredentials: {},
    userPreferences: {},
    reminderEvents: [],
    invoiceMetadata: {},
    nextReminderEventId: 1,
  };
}

async function readState() {
  try {
    const raw = await readFile(STORE_PATH, "utf8");
    const parsed = JSON.parse(raw) as LocalState;

    if (!parsed.organizations[DEFAULT_ORGANIZATION_ID]) {
      parsed.organizations[DEFAULT_ORGANIZATION_ID] =
        createDefaultState().organizations[DEFAULT_ORGANIZATION_ID];
    }

    return parsed;
  } catch {
    return createDefaultState();
  }
}

async function writeState(state: LocalState) {
  await mkdir(STORE_DIR, { recursive: true });
  await writeFile(STORE_PATH, JSON.stringify(state, null, 2));
}

async function updateState<T>(updater: (state: LocalState) => T | Promise<T>) {
  const state = await readState();
  const result = await updater(state);
  await writeState(state);
  return result;
}

function getMetadataKey(organizationId: string, invoiceId: string) {
  return `${organizationId}:${invoiceId}`;
}

export async function createLocalUser(params: {
  email: string;
  name: string;
  passwordHash: string;
}) {
  return updateState((state) => {
    const existing = Object.values(state.appUsers).find((user) => user.email === params.email);
    if (existing) {
      throw new Error("A user with this email already exists");
    }

    const now = new Date().toISOString();
    state.appUsers[params.email] = {
      id: params.email,
      email: params.email,
      name: params.name,
      image: null,
      organizationId: DEFAULT_ORGANIZATION_ID,
      createdAt: now,
      updatedAt: now,
    };
    state.userAuthCredentials[params.email] = {
      userId: params.email,
      passwordHash: params.passwordHash,
      createdAt: now,
      updatedAt: now,
    };
    state.userPreferences[params.email] = {
      userId: params.email,
      ...DEFAULT_PREFERENCES,
      updatedAt: now,
    };
  });
}

export async function upsertLocalAppUser(user: {
  id: string;
  email: string;
  name?: string | null;
  image?: string | null;
}) {
  return updateState((state) => {
    const now = new Date().toISOString();
    const existing = state.appUsers[user.id];
    state.appUsers[user.id] = {
      id: user.id,
      email: user.email,
      name: user.name ?? existing?.name ?? user.email,
      image: user.image ?? existing?.image ?? null,
      organizationId: existing?.organizationId ?? DEFAULT_ORGANIZATION_ID,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };

    if (!state.userPreferences[user.id]) {
      state.userPreferences[user.id] = {
        userId: user.id,
        ...DEFAULT_PREFERENCES,
        updatedAt: now,
      };
    }
  });
}

export async function getLocalUserContext(email?: string | null) {
  if (!email) {
    return null;
  }

  const state = await readState();
  const user = Object.values(state.appUsers).find((entry) => entry.email === email);
  if (!user) {
    return null;
  }

  const organization = state.organizations[user.organizationId];
  if (!organization) {
    return null;
  }

  return {
    id: user.id,
    organization_id: organization.id,
    organization_name: organization.name,
  };
}

export async function getLocalCredentialUser(email: string) {
  const state = await readState();
  const user = Object.values(state.appUsers).find((entry) => entry.email === email);
  if (!user) {
    return null;
  }

  const credentials = state.userAuthCredentials[user.id];
  if (!credentials) {
    return null;
  }

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    password_hash: credentials.passwordHash,
  };
}

export async function getLocalUserPreferences(userId: string) {
  const state = await readState();
  const preferences = state.userPreferences[userId];
  if (!preferences) {
    return DEFAULT_PREFERENCES;
  }

  return {
    theme: preferences.theme,
    activeTab: preferences.activeTab,
    activeFilter: preferences.activeFilter,
    sortBy: preferences.sortBy,
    searchQuery: preferences.searchQuery,
  } satisfies UserPreferences;
}

export async function saveLocalUserPreferences(userId: string, preferences: Partial<UserPreferences>) {
  return updateState((state) => {
    const now = new Date().toISOString();
    const existing = state.userPreferences[userId];
    state.userPreferences[userId] = {
      userId,
      theme: preferences.theme ?? existing?.theme ?? DEFAULT_PREFERENCES.theme,
      activeTab: preferences.activeTab ?? existing?.activeTab ?? DEFAULT_PREFERENCES.activeTab,
      activeFilter:
        preferences.activeFilter ?? existing?.activeFilter ?? DEFAULT_PREFERENCES.activeFilter,
      sortBy: preferences.sortBy ?? existing?.sortBy ?? DEFAULT_PREFERENCES.sortBy,
      searchQuery:
        preferences.searchQuery ?? existing?.searchQuery ?? DEFAULT_PREFERENCES.searchQuery,
      updatedAt: now,
    };
  });
}

export async function getLocalSettings(organizationId: string) {
  const state = await readState();
  const organization = state.organizations[organizationId];
  const secrets = state.organizationSecrets[organizationId];

  return {
    businessName: organization?.name ?? DEFAULT_BUSINESS_NAME,
    env: organization?.morningEnv ?? DEFAULT_ENV,
    waTemplate: organization?.waTemplate ?? DEFAULT_WHATSAPP_TEMPLATE,
    emailSubject: organization?.emailSubject ?? DEFAULT_EMAIL_SUBJECT,
    emailTemplate: organization?.emailTemplate ?? DEFAULT_EMAIL_TEMPLATE,
    hasCredentials: Boolean(secrets),
  } satisfies SettingsPayload;
}

export async function saveLocalSettings(
  organizationId: string,
  settings: Partial<SettingsPayload>,
) {
  return updateState((state) => {
    const now = new Date().toISOString();
    const existing = state.organizations[organizationId] ?? {
      ...createDefaultState().organizations[DEFAULT_ORGANIZATION_ID],
      id: organizationId,
      createdAt: now,
    };

    state.organizations[organizationId] = {
      ...existing,
      name: settings.businessName ?? existing.name,
      morningEnv: settings.env ?? existing.morningEnv,
      waTemplate: settings.waTemplate ?? existing.waTemplate,
      emailSubject: settings.emailSubject ?? existing.emailSubject,
      emailTemplate: settings.emailTemplate ?? existing.emailTemplate,
      updatedAt: now,
    };
  });
}

export async function saveLocalOrganizationCredentials(params: {
  organizationId: string;
  apiKeyId: string;
  apiSecret: string;
  env: string;
}) {
  return updateState((state) => {
    const now = new Date().toISOString();
    const organization = state.organizations[params.organizationId];

    state.organizations[params.organizationId] = {
      ...(organization ?? {
        ...createDefaultState().organizations[DEFAULT_ORGANIZATION_ID],
        id: params.organizationId,
        createdAt: now,
      }),
      morningEnv: params.env,
      updatedAt: now,
    };

    state.organizationSecrets[params.organizationId] = {
      organizationId: params.organizationId,
      morningApiKeyId: params.apiKeyId,
      morningApiSecret: params.apiSecret,
      updatedAt: now,
    };
  });
}

export async function getLocalOrganizationCredentials(organizationId: string) {
  const state = await readState();
  const organization = state.organizations[organizationId];
  const secrets = state.organizationSecrets[organizationId];

  if (!organization) {
    throw new Error("Organization not found");
  }

  if (!secrets) {
    throw new Error("Morning credentials not configured");
  }

  return {
    env: organization.morningEnv,
    apiKeyId: secrets.morningApiKeyId,
    apiSecret: secrets.morningApiSecret,
  };
}

export async function listLocalReminderEvents(organizationId: string) {
  const state = await readState();

  return state.reminderEvents
    .filter((event) => event.organizationId === organizationId)
    .sort((left, right) => right.sentAt.localeCompare(left.sentAt))
    .slice(0, 100)
    .map((event) => ({
      id: event.id,
      invoiceId: event.invoiceId,
      clientId: event.clientId,
      channel: event.channel,
      recipient: event.recipient,
      sentAt: event.sentAt,
      sentByName: state.appUsers[event.userId]?.name ?? null,
    })) satisfies ReminderEvent[];
}

export async function recordLocalReminderEvents(params: {
  organizationId: string;
  userId: string;
  events: Array<{
    invoiceId: string;
    clientId: string;
    channel: "whatsapp" | "email";
    recipient?: string;
  }>;
}) {
  return updateState((state) => {
    for (const event of params.events) {
      const now = new Date().toISOString();
      state.reminderEvents.push({
        id: state.nextReminderEventId,
        organizationId: params.organizationId,
        userId: params.userId,
        invoiceId: event.invoiceId,
        clientId: event.clientId,
        channel: event.channel,
        recipient: event.recipient ?? "",
        sentAt: now,
      });
      state.nextReminderEventId += 1;

      const key = getMetadataKey(params.organizationId, event.invoiceId);
      const existing = state.invoiceMetadata[key];
      state.invoiceMetadata[key] = {
        organizationId: params.organizationId,
        invoiceId: event.invoiceId,
        clientId: event.clientId,
        lastReminderAt: now,
        lastReminderChannel: event.channel,
        reminderCount: (existing?.reminderCount ?? 0) + 1,
        lastReminderByUserId: params.userId,
      };
    }
  });
}

export async function getLocalInvoiceMetadata(organizationId: string) {
  const state = await readState();

  return Object.values(state.invoiceMetadata)
    .filter((row) => row.organizationId === organizationId)
    .map((row) => ({
      invoice_id: row.invoiceId,
      last_reminder_at: row.lastReminderAt,
      last_reminder_channel: row.lastReminderChannel,
      reminder_count: row.reminderCount,
    }));
}

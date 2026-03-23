import { requireDb } from "./db";

type MorningEnv = "production" | "sandbox";

function getBaseUrl(env: string) {
  return env === "sandbox"
    ? "https://sandbox.greeninvoice.co.il/api/v1"
    : "https://api.greeninvoice.co.il/api/v1";
}

export async function fetchMorningToken(credentials: {
  apiKeyId: string;
  apiSecret: string;
  env: string;
}) {
  const response = await fetch(`${getBaseUrl(credentials.env)}/account/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      id: credentials.apiKeyId,
      secret: credentials.apiSecret,
    }),
  });

  const data = await response.json();

  if (!response.ok || !data.token) {
    throw new Error(data.errorMessage || data.error || "Failed to connect to Morning");
  }

  return data.token as string;
}

export async function getOrganizationCredentials(organizationId: string) {
  const sql = await requireDb();
  const rows = (await sql`
    SELECT
      organizations.morning_env,
      organization_secrets.morning_api_key_id,
      organization_secrets.morning_api_secret
    FROM organizations
    LEFT JOIN organization_secrets
      ON organization_secrets.organization_id = organizations.id
    WHERE organizations.id = ${organizationId}
    LIMIT 1
  `) as Array<{
    morning_env: string;
    morning_api_key_id: string | null;
    morning_api_secret: string | null;
  }>;

  const row = rows[0];
  if (!row) {
    throw new Error("Organization not found");
  }

  if (!row.morning_api_key_id || !row.morning_api_secret) {
    throw new Error("Morning credentials not configured");
  }

  return {
    env: row.morning_env as MorningEnv,
    apiKeyId: row.morning_api_key_id as string,
    apiSecret: row.morning_api_secret as string,
  };
}

export async function morningRequest<T>(params: {
  organizationId: string;
  endpoint: string;
  body: unknown;
}) {
  const credentials = await getOrganizationCredentials(params.organizationId);
  const token = await fetchMorningToken(credentials);

  const response = await fetch(`${getBaseUrl(credentials.env)}/${params.endpoint}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(params.body),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.errorMessage || data.error || `Morning request failed: ${response.status}`);
  }

  return data as T;
}

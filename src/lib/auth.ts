import type { NextAuthOptions } from "next-auth";
import { getServerSession } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import { DEFAULT_BUSINESS_NAME, DEFAULT_ORGANIZATION_ID } from "./constants";
import { getDb, requireDb } from "./db";

function getAllowedEmails() {
  return new Set(
    (process.env.GOOGLE_ALLOWED_EMAILS ?? "")
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  );
}

function isEmailAllowed(email: string) {
  const allowedDomain = process.env.GOOGLE_ALLOWED_DOMAIN?.trim().toLowerCase();
  const allowedEmails = getAllowedEmails();
  const normalizedEmail = email.trim().toLowerCase();

  if (allowedEmails.size > 0 && allowedEmails.has(normalizedEmail)) {
    return true;
  }

  if (allowedDomain) {
    return normalizedEmail.endsWith(`@${allowedDomain}`);
  }

  return allowedEmails.size === 0;
}

async function upsertAppUser(user: {
  id: string;
  email: string;
  name?: string | null;
  image?: string | null;
}) {
  const sql = await requireDb();

  await sql`
    INSERT INTO organizations (id, name)
    VALUES (${DEFAULT_ORGANIZATION_ID}, ${DEFAULT_BUSINESS_NAME})
    ON CONFLICT (id) DO NOTHING
  `;

  await sql`
    INSERT INTO app_users (id, email, name, image, organization_id)
    VALUES (
      ${user.id},
      ${user.email},
      ${user.name ?? null},
      ${user.image ?? null},
      ${DEFAULT_ORGANIZATION_ID}
    )
    ON CONFLICT (id) DO UPDATE SET
      email = EXCLUDED.email,
      name = EXCLUDED.name,
      image = EXCLUDED.image,
      updated_at = NOW()
  `;

  await sql`
    INSERT INTO user_preferences (user_id)
    VALUES (${user.id})
    ON CONFLICT (user_id) DO NOTHING
  `;
}

async function getUserContext(email?: string | null) {
  if (!email) {
    return null;
  }

  const sql = getDb();
  if (!sql) {
    return null;
  }

  const result = (await sql`
    SELECT
      app_users.id,
      app_users.organization_id,
      organizations.name AS organization_name
    FROM app_users
    JOIN organizations ON organizations.id = app_users.organization_id
    WHERE app_users.email = ${email}
    LIMIT 1
  `) as Array<{
    id: string;
    organization_id: string;
    organization_name: string;
  }>;

  return result[0] ?? null;
}

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID ?? "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
    }),
  ],
  session: {
    strategy: "jwt",
  },
  pages: {
    signIn: "/",
    error: "/",
  },
  callbacks: {
    async signIn({ user }) {
      if (!user.email || !isEmailAllowed(user.email)) {
        return false;
      }

      const appUserId = user.email.trim().toLowerCase();

      if (getDb()) {
        await upsertAppUser({
          id: appUserId,
          email: user.email,
          name: user.name,
          image: user.image,
        });
      }

      return true;
    },
    async jwt({ token, user }) {
      if (user?.email) {
        token.userId = user.email.trim().toLowerCase();
      }

      if (user?.email && getDb()) {
        const context = await getUserContext(user.email);
        if (context) {
          token.userId = context.id;
          token.organizationId = context.organization_id;
          token.organizationName = context.organization_name;
        }
      } else if (token.email && getDb() && !token.organizationId) {
        const context = await getUserContext(token.email);
        if (context) {
          token.userId = context.id;
          token.organizationId = context.organization_id;
          token.organizationName = context.organization_name;
        }
      }

      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = typeof token.userId === "string" ? token.userId : token.sub ?? "";
        session.user.organizationId =
          typeof token.organizationId === "string"
            ? token.organizationId
            : DEFAULT_ORGANIZATION_ID;
        session.user.organizationName =
          typeof token.organizationName === "string"
            ? token.organizationName
            : DEFAULT_BUSINESS_NAME;
      }

      return session;
    },
  },
  secret: process.env.NEXTAUTH_SECRET,
};

export function auth() {
  return getServerSession(authOptions);
}

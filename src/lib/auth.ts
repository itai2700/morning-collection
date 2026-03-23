import type { NextAuthOptions } from "next-auth";
import { getServerSession } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { DEFAULT_BUSINESS_NAME, DEFAULT_ORGANIZATION_ID } from "./constants";
import { getDb, requireDb } from "./db";
import {
  getLocalCredentialUser,
  getLocalUserContext,
  upsertLocalAppUser,
} from "./local-store";
import { verifyPassword } from "./passwords";

function getConfiguredCredentials() {
  return {
    email: process.env.AUTH_EMAIL?.trim().toLowerCase() ?? "",
    password: process.env.AUTH_PASSWORD ?? "",
    name: process.env.AUTH_NAME?.trim() || "Itai",
  };
}

async function upsertAppUser(user: {
  id: string;
  email: string;
  name?: string | null;
  image?: string | null;
}) {
  if (!getDb()) {
    await upsertLocalAppUser(user);
    return;
  }

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
    return getLocalUserContext(email);
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

async function getDbCredentialUser(email: string) {
  const sql = getDb();
  if (!sql) {
    return getLocalCredentialUser(email);
  }

  const result = (await sql`
    SELECT
      app_users.id,
      app_users.email,
      app_users.name,
      user_auth_credentials.password_hash
    FROM app_users
    JOIN user_auth_credentials ON user_auth_credentials.user_id = app_users.id
    WHERE app_users.email = ${email}
    LIMIT 1
  `) as Array<{
    id: string;
    email: string;
    name: string | null;
    password_hash: string;
  }>;

  return result[0] ?? null;
}

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: "Email and Password",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const configured = getConfiguredCredentials();
        const email = credentials?.email?.trim().toLowerCase() ?? "";
        const password = credentials?.password ?? "";

        const dbUser = email ? await getDbCredentialUser(email) : null;
        if (dbUser && (await verifyPassword(password, dbUser.password_hash))) {
          return {
            id: dbUser.id,
            email: dbUser.email,
            name: dbUser.name ?? dbUser.email,
          };
        }

        if (!configured.email || !configured.password) {
          return null;
        }

        if (email !== configured.email || password !== configured.password) {
          return null;
        }

        return {
          id: configured.email,
          email: configured.email,
          name: configured.name,
        };
      },
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
      if (!user.email) {
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

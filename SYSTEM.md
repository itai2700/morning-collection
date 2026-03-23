# Morning Collection System

## Audience

This document is written for a project owner without a programming background. It describes the system in simple operational terms and focuses on what the system does for the business.

## Purpose

Morning Collection is a system for an organic marketing agency that manages monthly retainer payments from its clients. The goal is to help the agency track open invoices, organize collection activity, and keep a clear record of payment reminders sent to recurring clients.

Technically, the system is built as a Next.js 16 application that stores organization settings, connects to Morning, and documents reminder activity sent by WhatsApp or email.

## Main Capabilities

- User registration and sign-in with `next-auth`
- Persistent organization settings and user preferences in Postgres
- Connection to Morning API for pulling open invoices and client data
- Reminder history tracking per invoice and per organization
- Central UI for invoice review, filtering, sorting, and reminder workflows
- Support for a business model based on fixed monthly retainer billing

## Stack

- Framework: Next.js 16 App Router
- UI: React 19, client-heavy dashboard
- Auth: `next-auth`
- Database: Postgres via `@neondatabase/serverless`
- Language: TypeScript

## Core Structure

- `src/app/page.tsx`: authenticated app entry
- `src/components/morning-collection-app.tsx`: main dashboard and client-side flows
- `src/app/api/invoices/route.ts`: fetches open invoices and clients from Morning and enriches them with local reminder metadata
- `src/app/api/reminders/route.ts`: reads and records reminder events
- `src/app/api/settings/route.ts`: reads and updates organization settings
- `src/app/api/preferences/route.ts`: persists user UI preferences
- `src/app/api/morning/credentials/route.ts`: stores Morning credentials per organization
- `src/app/api/auth/register/route.ts`: local user registration
- `src/lib/db.ts`: schema bootstrap and database access
- `src/lib/morning.ts`: Morning API request layer
- `src/lib/session.ts`: authenticated session enforcement for API routes

## Data Model

The application creates and uses these main tables automatically:

- `organizations`: business identity, Morning environment, message templates
- `organization_secrets`: Morning API key and secret
- `app_users`: app users mapped to an organization
- `user_auth_credentials`: password hashes
- `user_preferences`: theme, active tab, filter, sort, search state
- `reminder_events`: audit log of reminders sent
- `invoice_metadata`: last reminder date, channel, and count per invoice

## Main Flow

1. User signs in or registers.
2. App loads settings, preferences, and reminder history.
3. If Morning credentials exist, the app pulls open documents and clients from Morning.
4. Invoice data is enriched with local reminder metadata from Postgres.
5. User sends reminders externally and the app records those actions through `/api/reminders`.

## Business Context

The system is intended for an SEO agency working with clients on a fixed monthly retainer.

- Each client is expected to pay a recurring monthly amount
- The main operational need is to identify unpaid invoices quickly
- The team needs a simple way to follow up with clients and document collection actions
- The system helps turn collection work into a repeatable process instead of manual tracking

## Environment Variables

Required in `.env.local`:

- `DATABASE_URL`: Postgres connection string
- `NEXTAUTH_URL`: app URL, usually `http://localhost:3000`
- `NEXTAUTH_SECRET`: NextAuth secret
- `AUTH_EMAIL`: fallback local auth email
- `AUTH_PASSWORD`: fallback local auth password
- `AUTH_NAME`: fallback local auth display name

## Notes

- If `DATABASE_URL` is missing, registration and DB-backed APIs fail.
- The schema is initialized lazily on first database access.
- Invoice sync currently focuses on open accounting documents returned from Morning search endpoints.

This is a Next.js app for managing invoice reminders and Morning connection settings.

## Environment

Copy `.env.example` to `.env.local` and set the required variables:

```bash
cp .env.example .env.local
```

Required values:

- `DATABASE_URL`: Postgres connection string used for users, preferences, reminder history, and Morning credentials
- `NEXTAUTH_URL`: usually `http://localhost:3000` in local development
- `NEXTAUTH_SECRET`: random secret for NextAuth
- `AUTH_EMAIL`, `AUTH_PASSWORD`, `AUTH_NAME`: local fallback credentials for sign-in

Example:

```env
DATABASE_URL=postgres://USER:PASSWORD@HOST:5432/DB_NAME?sslmode=require
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=replace-with-a-random-secret
AUTH_EMAIL=name@example.com
AUTH_PASSWORD=replace-with-a-password
AUTH_NAME=Your Name
```

If `DATABASE_URL` is missing, registration and all database-backed API routes will fail.

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) after the env file is configured.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

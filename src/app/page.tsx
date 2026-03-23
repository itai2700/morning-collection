import { auth } from "@/lib/auth";
import { MorningCollectionApp } from "@/components/morning-collection-app";
import { SignInScreen } from "@/components/sign-in-screen";

export default async function Page() {
  const session = await auth();
  const credentialsConfigured = Boolean(
    process.env.AUTH_EMAIL &&
      process.env.AUTH_PASSWORD &&
      process.env.NEXTAUTH_SECRET &&
      process.env.NEXTAUTH_URL,
  );

  if (!session?.user) {
    return <SignInScreen credentialsConfigured={credentialsConfigured} />;
  }

  return (
    <MorningCollectionApp
      user={{
        name: session.user.name,
        email: session.user.email,
        organizationName: session.user.organizationName,
      }}
    />
  );
}

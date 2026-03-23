import { auth } from "@/lib/auth";
import { MorningCollectionApp } from "@/components/morning-collection-app";
import { SignInScreen } from "@/components/sign-in-screen";

export default async function Page() {
  const session = await auth();

  if (!session?.user) {
    return <SignInScreen />;
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

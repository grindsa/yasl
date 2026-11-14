import { Suspense } from "react";
import { connection } from "next/server";
import { getSessionGroup, isAuthenticated } from "@/lib/auth";
import { LoginForm } from "@/components/LoginForm";
import { ListsHome } from "@/components/ListsHome";

async function HomeContent() {
  await connection();
  const authenticated = await isAuthenticated();
  if (!authenticated) {
    return <LoginForm />;
  }
  const session = await getSessionGroup();
  return <ListsHome groupName={session?.groupName ?? "Gruppe"} />;
}

function HomeFallback() {
  return (
    <main className="mx-auto flex min-h-full w-full max-w-md flex-1 flex-col justify-center px-6 py-12">
      <p className="text-center text-4xl font-semibold tracking-tight text-accent">
        YASL
      </p>
      <p className="mt-4 text-center text-sm text-muted">Laden…</p>
    </main>
  );
}

export default function HomePage() {
  return (
    <Suspense fallback={<HomeFallback />}>
      <HomeContent />
    </Suspense>
  );
}

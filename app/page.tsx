import { Suspense } from "react";
import { connection } from "next/server";
import { getSessionGroup, isAuthenticated } from "@/lib/auth";
import { LoginForm } from "@/components/LoginForm";
import { ListsHome } from "@/components/ListsHome";
import { ThemeToggle } from "@/components/ThemeToggle";

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
    <main className="relative mx-auto flex min-h-full w-full max-w-md flex-1 flex-col px-6 py-12">
      <div className="absolute right-6 top-6 z-10">
        <ThemeToggle />
      </div>
      <div className="flex flex-1 flex-col justify-center">
        <p className="text-center text-4xl font-semibold tracking-tight text-accent">
          YASL
        </p>
        <p className="mt-4 text-center text-sm text-muted">Laden…</p>
      </div>
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

import { Suspense } from "react";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { isAuthenticated } from "@/lib/auth";
import { ListDetail } from "@/components/ListDetail";

async function DetailGate({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await connection();
  const { id } = await params;
  if (!(await isAuthenticated())) {
    redirect("/");
  }
  return <ListDetail listId={id} />;
}

export default function ListPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <Suspense
      fallback={
        <main className="mx-auto max-w-lg px-5 py-8 text-muted">Laden…</main>
      }
    >
      <DetailGate params={params} />
    </Suspense>
  );
}

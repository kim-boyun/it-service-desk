"use client";

import { useMemo } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { makeQueryClient } from "@/lib/queryClient";
import AuthGuard from "@/components/AuthGuard";
import Sidebar from "@/components/Sidebar";

function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen grid grid-cols-1 md:grid-cols-[260px_1fr]">
      <Sidebar />
      <main className="min-w-0">{children}</main>
    </div>
  );
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const qc = useMemo(() => makeQueryClient(), []);
  return (
    <QueryClientProvider client={qc}>
      <AuthGuard>
        <AppShell>{children}</AppShell>
      </AuthGuard>
    </QueryClientProvider>
  );
}

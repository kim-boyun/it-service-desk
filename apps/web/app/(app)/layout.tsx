"use client";

import { useMemo } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { makeQueryClient } from "@/lib/queryClient";
import AuthGuard from "@/components/AuthGuard";
import Sidebar from "@/components/Sidebar";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMe } from "@/lib/auth-context";

function TopNav() {
  const pathname = usePathname();
  const me = useMe();
  const items = [
    { href: "/home", label: "HOME" },
    { href: "/tickets", label: "티켓" },
    { href: "/notices", label: "공지사항" },
    { href: "/faq", label: "FAQ" },
    ...(me.role === "admin" ? [{ href: "/admin", label: "관리자" }] : []),
  ];

  return (
    <header className="h-24 border-b bg-white/90 backdrop-blur sticky top-0 z-30 shadow-md">
      <div className="h-full px-12 flex items-center justify-between">
        <div className="leading-tight">
          <div className="text-2xl font-extrabold text-gray-900">IT Service Desk</div>
          <div className="text-sm text-gray-500">더 빠른 지원을 위한 헬프데스크</div>
        </div>
        <nav className="flex items-center gap-16 text-xl">
          {items.map((it) => {
            const active = pathname === it.href || pathname?.startsWith(it.href + "/");
            return (
              <Link
                key={it.href}
                href={it.href}
                className={`transition-colors ${
                  active
                    ? "font-bold text-gray-900 border-b-4 border-sky-500 pb-2"
                    : "text-gray-600 hover:text-gray-800"
                }`}
              >
                {it.label}
              </Link>
            );
          })}
        </nav>
        <div className="text-base text-gray-700 flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-emerald-500 inline-block" aria-hidden />
          {me.email || "KDI국제정책대학원"}
        </div>
      </div>
    </header>
  );
}

function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const showTicketSidebar = pathname.startsWith("/tickets");

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-sky-50">
      <TopNav />
      <div className="max-w-7xl mx-auto px-6 py-4 flex gap-6">
        {showTicketSidebar && <Sidebar />}
        <main className="flex-1 min-w-0">{children}</main>
      </div>
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

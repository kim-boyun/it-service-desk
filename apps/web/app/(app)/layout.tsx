"use client";

import { useMemo, useEffect } from "react";
import { usePathname } from "next/navigation";
import { QueryClientProvider } from "@tanstack/react-query";
import { makeQueryClient } from "@/lib/queryClient";
import AuthGuard from "@/components/AuthGuard";
import Sidebar from "@/components/Sidebar";
import TopBar from "@/components/TopBar";

function resolvePageTitle(pathname: string) {
  if (pathname === "/home") return "홈";
  if (pathname === "/tickets/new") return "요청 작성";
  if (pathname === "/tickets") return "요청 목록";
  if (pathname.startsWith("/tickets/resolved")) return "처리 완료";
  if (pathname.startsWith("/tickets/review")) return "사업 검토";
  if (pathname.startsWith("/tickets/drafts")) return "임시 보관함";
  if (/^\/tickets\/\d+\/edit$/.test(pathname)) return "요청 수정";
  if (/^\/tickets\/\d+\/comments\/new$/.test(pathname)) return "댓글 등록";
  if (/^\/tickets\/\d+$/.test(pathname)) return "요청 상세";
  if (pathname === "/admin") return "관리자 대시보드";
  if (pathname.startsWith("/admin/users")) return "사용자 관리";
  if (pathname.startsWith("/admin/tickets/all")) return "모든 요청 관리";
  if (pathname.startsWith("/admin/tickets")) return "요청 관리";
  if (pathname.startsWith("/admin/manager")) return "카테고리 관리";
  if (pathname.startsWith("/notices")) return "공지사항";
  if (pathname.startsWith("/faq")) return "FAQ";
  return "IT DESK";
}

function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.scrollTo({ top: 0, left: 0, behavior: "instant" as ScrollBehavior });
  }, [pathname]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const pageTitle = resolvePageTitle(pathname);
    document.title = pageTitle === "IT DESK" ? "IT DESK" : `IT DESK - ${pageTitle}`;
  }, [pathname]);

  return (
    <div className="min-h-screen bg-neutral-50">
      <Sidebar />
      <div className="lg:ml-72 flex flex-col min-h-screen">
        <header className="sticky top-0 z-10 bg-white border-b border-neutral-200">
          <div className="px-6 py-3.5">
            <div className="mx-auto w-full max-w-[1400px] flex justify-end">
            <TopBar />
          </div>
        </div>
        </header>
        <main className="flex-1 px-6 py-6 app-content">
          <div className="mx-auto w-full max-w-[1400px]">{children}</div>
        </main>
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

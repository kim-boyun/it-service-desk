"use client";

import { useMemo, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { QueryClientProvider } from "@tanstack/react-query";
import { makeQueryClient } from "@/lib/queryClient";
import AuthGuard from "@/components/AuthGuard";
import Sidebar from "@/components/Sidebar";
import TopBar from "@/components/TopBar";
import { Menu } from "lucide-react";

function resolvePageTitle(pathname: string) {
  if (pathname === "/home") return "홈";
  if (pathname === "/tickets/new") return "요청 작성";
  if (pathname === "/tickets") return "요청 목록";
  if (pathname.startsWith("/tickets/resolved")) return "처리 완료";
  if (pathname.startsWith("/tickets/review")) return "사업 검토";
  if (/^\/tickets\/\d+\/edit$/.test(pathname)) return "요청 수정";
  if (/^\/tickets\/\d+\/comments\/new$/.test(pathname)) return "답변 등록";
  if (/^\/tickets\/\d+$/.test(pathname)) return "요청 상세";
  if (pathname === "/admin") return "관리자 대시보드";
  if (pathname.startsWith("/admin/users")) return "사용자 관리";
  if (pathname.startsWith("/admin/tickets/all")) return "모든 요청 관리";
  if (pathname.startsWith("/admin/tickets")) return "요청 관리";
  if (pathname.startsWith("/admin/manager")) return "카테고리 관리";
  if (pathname.startsWith("/admin/data")) return "데이터 추출";
  if (pathname.startsWith("/notices")) return "공지사항";
  if (pathname.startsWith("/faq")) return "FAQ";
  return "IT DESK";
}

function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isHomePage = pathname === "/home";
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.scrollTo({ top: 0, left: 0, behavior: "instant" as ScrollBehavior });
  }, [pathname]);

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const pageTitle = resolvePageTitle(pathname);
    document.title = pageTitle === "IT DESK" ? "IT DESK" : `IT DESK - ${pageTitle}`;
  }, [pathname]);

  return (
    <div
      className="min-h-screen transition-colors duration-200"
      style={{ backgroundColor: "var(--bg-page)" }}
    >
      {/* 모바일: 메뉴 열렸을 때만 백드롭 표시 */}
      {mobileMenuOpen && (
        <button
          type="button"
          className="fixed inset-0 z-20 bg-black/50 lg:hidden"
          onClick={() => setMobileMenuOpen(false)}
          aria-label="메뉴 닫기"
        />
      )}
      <Sidebar
        mobileOpen={mobileMenuOpen}
        onMobileClose={() => setMobileMenuOpen(false)}
      />
      <div className="lg:ml-[280px] flex flex-col min-h-screen transition-all duration-300">
        <header
          className="sticky top-0 z-10 border-b"
          style={{
            backgroundColor: "var(--topbar-bg)",
            borderColor: "var(--topbar-border)",
          }}
        >
          <div className="px-4 sm:px-6 py-3.5">
            <div className="mx-auto w-full max-w-[1800px] flex items-center justify-between gap-4">
              <button
                type="button"
                className="lg:hidden flex items-center justify-center w-10 h-10 rounded-lg border transition-colors"
                style={{
                  backgroundColor: "var(--bg-elevated)",
                  borderColor: "var(--border-default)",
                  color: "var(--text-secondary)",
                }}
                onClick={() => setMobileMenuOpen(true)}
                aria-label="메뉴 열기"
              >
                <Menu className="w-5 h-5" />
              </button>
              <div className="flex-1 min-w-0 flex justify-end">
                <TopBar />
              </div>
            </div>
          </div>
        </header>
        <main className="flex-1 px-4 sm:px-6 py-4 sm:py-6 app-content min-w-0">
          <div className={`mx-auto w-full min-w-0 ${isHomePage ? "max-w-[1400px]" : "max-w-[1800px]"}`}>
            {children}
          </div>
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

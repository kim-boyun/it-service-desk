"use client";

import { useMemo, useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useMe } from "@/lib/auth-context";
import { clearToken } from "@/lib/auth";
import { useNotifications } from "@/lib/use-notifications";

function formatDate(v?: string | null) {
  if (!v) return "-";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? "-" : d.toLocaleString();
}

function typeLabel(type: string) {
  const map: Record<string, string> = {
    status_changed: "상태 변경",
    assignee_assigned: "담당자 배정",
    assignee_changed: "담당자 변경",
    requester_updated: "요청 수정",
    requester_commented: "요청자 댓글",
    new_ticket: "새 요청",
  };
  return map[type] ?? type;
}

export default function TopBar() {
  const me = useMe();
  const router = useRouter();
  const { notifications, unreadCount, isLoading, markAllRead } = useNotifications();
  const [notifOpen, setNotifOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const notifRef = useRef<HTMLDivElement | null>(null);

  const items = useMemo(() => notifications.slice(0, 20), [notifications]);
  const isStaff = me.role === "admin";

  useEffect(() => {
    if (!notifOpen) return;
    const handlePointer = (event: PointerEvent) => {
      if (!notifRef.current) return;
      if (!notifRef.current.contains(event.target as Node)) {
        setNotifOpen(false);
      }
    };
    document.addEventListener("pointerdown", handlePointer);
    return () => document.removeEventListener("pointerdown", handlePointer);
  }, [notifOpen]);

  return (
    <div className="flex items-center gap-2">
      <div className="relative" ref={notifRef}>
        <button
          type="button"
          className="relative inline-flex h-9 w-9 items-center justify-center rounded-lg border border-neutral-200 bg-white text-neutral-600 hover:bg-neutral-50 hover:text-neutral-900 transition-colors"
          onClick={() => {
            const next = !notifOpen;
            setNotifOpen(next);
            if (next) markAllRead();
          }}
          aria-label="알림"
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 8a6 6 0 10-12 0c0 7-3 8-3 8h18s-3-1-3-8" />
            <path d="M13.73 21a2 2 0 01-3.46 0" />
          </svg>
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 rounded-full bg-danger-600 text-white text-[10px] min-w-[18px] h-[18px] flex items-center justify-center px-1 font-medium shadow-sm">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </button>
        {notifOpen && (
          <div className="absolute right-0 mt-2 w-[380px] rounded-xl border border-neutral-200 bg-white shadow-xl overflow-hidden z-20">
            <div className="px-4 py-3 border-b border-neutral-200 text-sm font-semibold text-neutral-900">알림</div>
            <div className="max-h-[420px] overflow-y-auto">
              {isLoading && <div className="px-4 py-6 text-center text-sm text-neutral-500">불러오는 중...</div>}
              {!isLoading && items.length === 0 && (
                <div className="px-4 py-8 text-center text-sm text-neutral-500">알림이 없습니다.</div>
              )}
              {items.map((n) => (
                <button
                  key={n.id}
                  type="button"
                  className="w-full text-left px-4 py-3 border-b border-neutral-100 last:border-b-0 hover:bg-neutral-50 transition-colors"
                  onClick={() => {
                    if (n.ticket_id) {
                      const href = isStaff ? `/admin/tickets/${n.ticket_id}` : `/tickets/${n.ticket_id}`;
                      router.push(href);
                    }
                    setNotifOpen(false);
                  }}
                >
                  <div className="text-xs font-medium text-primary-600 mb-1">{typeLabel(n.type)}</div>
                  <div className="text-sm text-neutral-900 line-clamp-2">
                    {n.message || n.ticket_title || "내용 없음"}
                  </div>
                  <div className="text-xs text-neutral-500 mt-1.5">{formatDate(n.created_at)}</div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="relative">
        <button
          type="button"
          className="inline-flex items-center gap-2 rounded-lg border border-neutral-200 bg-white px-3.5 py-2 text-sm text-neutral-700 hover:bg-neutral-50 hover:border-neutral-300 transition-colors"
          onClick={() => setMenuOpen((prev) => !prev)}
        >
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-full bg-primary-100 text-primary-700 flex items-center justify-center text-xs font-semibold">
              {(me.kor_name?.[0] || me.emp_no?.[0] || "U").toUpperCase()}
            </div>
            <span className="font-medium">{me.emp_no ?? me.kor_name ?? "사용자"}</span>
          </div>
          <svg
            viewBox="0 0 20 20"
            className={`h-4 w-4 transition-transform duration-200 ${menuOpen ? "rotate-180" : ""}`}
            fill="currentColor"
          >
            <path
              fillRule="evenodd"
              d="M5.23 7.21a.75.75 0 011.06.02L10 11.114l3.71-3.884a.75.75 0 011.08 1.04l-4.24 4.44a.75.75 0 01-1.08 0l-4.24-4.44a.75.75 0 01.02-1.06z"
              clipRule="evenodd"
            />
          </svg>
        </button>
        {menuOpen && (
          <div className="absolute right-0 mt-2 w-48 rounded-lg border border-neutral-200 bg-white shadow-lg overflow-hidden z-20">
            <button
              type="button"
              className="w-full px-4 py-2.5 text-left text-sm text-neutral-700 hover:bg-neutral-50 transition-colors font-medium"
              onClick={() => {
                clearToken();
                router.replace("/login");
              }}
            >
              로그아웃
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

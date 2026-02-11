"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMe } from "@/lib/auth-context";
import {
  PenSquare,
  Megaphone,
  HelpCircle,
  Ticket,
  ClipboardCheck,
  BarChart3,
  Users,
  Tags,
  FolderKanban,
  ClipboardList,
  List,
  UserCog,
  ChevronLeft,
  ChevronRight,
  X,
} from "lucide-react";

interface NavItem {
  href: string;
  label: string;
  icon: any;
  badge?: number;
}

interface NavItemWithSub extends NavItem {
  subItems?: NavItem[];
}

function NavLink({
  href,
  label,
  icon: Icon,
  active,
  collapsed,
  badge,
  onClick,
  onNavigate,
}: {
  href: string;
  label: string;
  icon: any;
  active?: boolean;
  collapsed?: boolean;
  badge?: number;
  onClick?: () => void;
  onNavigate?: () => void;
}) {
  const content = (
    <>
      <Icon className="w-5 h-5 flex-shrink-0" />
      {!collapsed && (
        <>
          <span className="flex-1 font-medium">{label}</span>
          {badge !== undefined && badge > 0 && (
            <span
              className="px-2 py-0.5 text-xs font-semibold rounded-full"
              style={{
                backgroundColor: active ? "var(--color-primary-200)" : "var(--bg-active)",
                color: active ? "var(--color-primary-800)" : "var(--text-secondary)",
              }}
            >
              {badge}
            </span>
          )}
        </>
      )}
    </>
  );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all duration-200 w-full"
        style={{
          backgroundColor: active ? "var(--sidebar-item-active)" : "transparent",
          color: active ? "var(--sidebar-text-active)" : "var(--sidebar-text)",
        }}
        onMouseEnter={(e) => {
          if (!active) {
            e.currentTarget.style.backgroundColor = "var(--sidebar-item-hover)";
          }
        }}
        onMouseLeave={(e) => {
          if (!active) {
            e.currentTarget.style.backgroundColor = "transparent";
          }
        }}
      >
        {content}
      </button>
    );
  }

  return (
    <Link
      href={href}
      className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all duration-200 min-w-0"
      style={{
        backgroundColor: active ? "var(--sidebar-item-active)" : "transparent",
        color: active ? "var(--sidebar-text-active)" : "var(--sidebar-text)",
      }}
      onMouseEnter={(e) => {
        if (!active) {
          e.currentTarget.style.backgroundColor = "var(--sidebar-item-hover)";
        }
      }}
      onMouseLeave={(e) => {
        if (!active) {
          e.currentTarget.style.backgroundColor = "transparent";
        }
      }}
      onClick={onNavigate}
    >
      {content}
    </Link>
  );
}

function ExpandableNavItem({
  item,
  active,
  collapsed,
  expanded,
  onToggle,
  subItems,
  onNavigate,
  pathname,
}: {
  item: NavItem;
  active: boolean;
  collapsed: boolean;
  expanded: boolean;
  onToggle: () => void;
  subItems: NavItem[];
  onNavigate?: () => void;
  pathname: string;
}) {
  const Icon = item.icon;

  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all duration-200 w-full"
        style={{
          backgroundColor: active ? "var(--sidebar-item-active)" : "transparent",
          color: active ? "var(--sidebar-text-active)" : "var(--sidebar-text)",
        }}
        onMouseEnter={(e) => {
          if (!active) {
            e.currentTarget.style.backgroundColor = "var(--sidebar-item-hover)";
          }
        }}
        onMouseLeave={(e) => {
          if (!active) {
            e.currentTarget.style.backgroundColor = "transparent";
          }
        }}
      >
        <Icon className="w-5 h-5 flex-shrink-0" />
        {!collapsed && (
          <>
            <span className="flex-1 font-medium text-left">{item.label}</span>
            {expanded ? (
              <ChevronRight className="w-4 h-4 transform rotate-90 transition-transform duration-200" />
            ) : (
              <ChevronRight className="w-4 h-4 transition-transform duration-200" />
            )}
          </>
        )}
      </button>

      {expanded && !collapsed && (
        <div className="mt-1 ml-8 space-y-0.5">
          {subItems.map((sub) => {
            const SubIcon = sub.icon;
            const subActive = pathname === sub.href;
            return (
              <Link
                key={sub.href}
                href={sub.href}
                className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all duration-200 min-w-0"
                style={{
                  backgroundColor: subActive ? "var(--sidebar-item-active)" : "transparent",
                  color: subActive ? "var(--sidebar-text-active)" : "var(--sidebar-text)",
                }}
                onMouseEnter={(e) => {
                  if (!subActive) {
                    e.currentTarget.style.backgroundColor = "var(--sidebar-item-hover)";
                  }
                }}
                onMouseLeave={(e) => {
                  if (!subActive) {
                    e.currentTarget.style.backgroundColor = "transparent";
                  }
                }}
                onClick={onNavigate}
              >
                <SubIcon className="w-4 h-4" />
                <span className="font-medium">{sub.label}</span>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

interface SidebarProps {
  mobileOpen?: boolean;
  onMobileClose?: () => void;
}

export default function Sidebar({ mobileOpen = false, onMobileClose }: SidebarProps) {
  const me = useMe();
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [adminExpanded, setAdminExpanded] = useState(false);
  const [isLg, setIsLg] = useState(true);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const m = window.matchMedia("(min-width: 1024px)");
    setIsLg(m.matches);
    const fn = () => setIsLg(m.matches);
    m.addEventListener("change", fn);
    return () => m.removeEventListener("change", fn);
  }, []);

  useEffect(() => {
    if (pathname.startsWith("/admin")) {
      setAdminExpanded(true);
    }
  }, [pathname]);

  const mainNav: NavItem[] = [
    { href: "/home", label: "작성", icon: PenSquare },
    { href: "/notices", label: "공지사항", icon: Megaphone },
    { href: "/faq", label: "FAQ", icon: HelpCircle },
    { href: "/tickets", label: "처리 현황", icon: Ticket },
    { href: "/tickets/review", label: "사업 검토", icon: ClipboardCheck },
  ];

  const adminSubNav: NavItem[] = [
    { href: "/admin", label: "대시보드", icon: BarChart3 },
    { href: "/admin/users", label: "사용자 관리", icon: Users },
    { href: "/admin/manager", label: "카테고리 관리", icon: Tags },
    { href: "/admin/project", label: "프로젝트 관리", icon: FolderKanban },
    { href: "/admin/tickets", label: "내 담당 요청", icon: ClipboardList },
    { href: "/admin/tickets/all", label: "모든 요청", icon: List },
  ];

  const isAdminActive = pathname.startsWith("/admin");

  return (
    <aside
      className={`fixed inset-y-0 left-0 flex flex-col border-r z-30 transition-transform duration-300 ease-out lg:translate-x-0 ${
        mobileOpen ? "translate-x-0" : "-translate-x-full"
      }`}
      style={{
        width: isLg ? (collapsed ? "80px" : "280px") : "280px",
        backgroundColor: "var(--sidebar-bg)",
        borderColor: "var(--sidebar-border)",
      }}
    >
      <div className="flex items-center justify-between p-4 border-b shrink-0" style={{ borderColor: "var(--sidebar-border)" }}>
        {/* 모바일: 닫기 버튼 */}
        {mobileOpen && onMobileClose && (
          <button
            type="button"
            className="lg:hidden flex items-center justify-center w-10 h-10 rounded-lg transition-colors"
            style={{
              color: "var(--text-secondary)",
            }}
            onClick={onMobileClose}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = "var(--sidebar-item-hover)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = "transparent";
            }}
            aria-label="메뉴 닫기"
          >
            <X className="w-5 h-5" />
          </button>
        )}
        {!collapsed ? (
          <div className="flex-1 flex justify-center min-w-0">
            <Link href="/home" className="flex items-center justify-center" onClick={onMobileClose}>
              <div
                className="text-xl sm:text-2xl font-black tracking-tight break-keep"
                style={{
                  color: "var(--text-primary)",
                }}
              >
                IT DESK
              </div>
            </Link>
          </div>
        ) : (
          <Link href="/home" className="flex items-center justify-center w-full" onClick={onMobileClose}>
            <div
              className="text-lg sm:text-xl font-black break-keep"
              style={{
                color: "var(--text-primary)",
              }}
            >
              IT
            </div>
          </Link>
        )}

        {!collapsed && (
          <button
            type="button"
            onClick={() => setCollapsed(true)}
            className="hidden lg:flex p-1.5 rounded-lg transition-colors"
            style={{
              color: "var(--text-secondary)",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = "var(--sidebar-item-hover)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = "transparent";
            }}
            aria-label="Collapse sidebar"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
        )}
      </div>

      <nav className="flex-1 overflow-y-auto overflow-x-hidden p-3 space-y-1">
        {mainNav.map((item) => {
          const isTicketDetail = item.href === "/tickets" && /^\/tickets\/\d+(\/|$)/.test(pathname);
          return (
            <NavLink
              key={item.href}
              {...item}
              active={
                pathname === item.href ||
                (item.href !== "/tickets" && pathname.startsWith(item.href + "/")) ||
                isTicketDetail
              }
              collapsed={collapsed}
              onNavigate={onMobileClose}
            />
          );
        })}

        {me.role === "admin" && (
          <>
            <div className="my-3 border-t" style={{ borderColor: "var(--sidebar-border)" }} />
            <ExpandableNavItem
              item={{ href: "/admin", label: "관리자", icon: UserCog }}
              active={isAdminActive}
              collapsed={collapsed}
              expanded={adminExpanded}
              onToggle={() => setAdminExpanded(!adminExpanded)}
              subItems={adminSubNav}
              onNavigate={onMobileClose}
              pathname={pathname}
            />
          </>
        )}
      </nav>

      <div className="p-3 border-t shrink-0" style={{ borderColor: "var(--sidebar-border)" }}>
        {collapsed ? (
          <button
            type="button"
            onClick={() => setCollapsed(false)}
            className="hidden lg:flex items-center justify-center w-full p-2.5 rounded-lg transition-colors"
            style={{
              color: "var(--text-secondary)",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = "var(--sidebar-item-hover)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = "transparent";
            }}
            aria-label="Expand sidebar"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        ) : (
          <div className="flex items-center justify-center">
            <Image src="/kdi-school-logo.png" alt="KDI SCHOOL" width={160} height={42} className="opacity-70" />
          </div>
        )}
      </div>
    </aside>
  );
}

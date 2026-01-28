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
  CheckCircle,
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
}: {
  href: string;
  label: string;
  icon: any;
  active?: boolean;
  collapsed?: boolean;
  badge?: number;
  onClick?: () => void;
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
      className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all duration-200"
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
}: {
  item: NavItem;
  active: boolean;
  collapsed: boolean;
  expanded: boolean;
  onToggle: () => void;
  subItems: NavItem[];
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
            return (
              <Link
                key={sub.href}
                href={sub.href}
                className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all duration-200"
                style={{
                  backgroundColor: "transparent",
                  color: "var(--sidebar-text)",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = "var(--sidebar-item-hover)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = "transparent";
                }}
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

export default function Sidebar() {
  const me = useMe();
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [adminExpanded, setAdminExpanded] = useState(false);

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
    { href: "/tickets/resolved", label: "처리 완료", icon: CheckCircle },
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
      className="relative lg:fixed lg:inset-y-0 lg:left-0 flex flex-col border-r z-20 transition-all duration-300"
      style={{
        width: collapsed ? "80px" : "280px",
        backgroundColor: "var(--sidebar-bg)",
        borderColor: "var(--sidebar-border)",
      }}
    >
      <div className="flex items-center justify-between p-4 border-b" style={{ borderColor: "var(--sidebar-border)" }}>
        {!collapsed ? (
          <div className="flex-1 flex justify-center min-w-0">
            <Link href="/home" className="flex items-center justify-center">
              <div
                className="text-2xl font-black tracking-tight"
                style={{
                  color: "var(--text-primary)",
                }}
              >
                IT DESK
              </div>
            </Link>
          </div>
        ) : (
          <Link href="/home" className="flex items-center justify-center w-full">
            <div
              className="text-xl font-black"
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
            className="p-1.5 rounded-lg transition-colors"
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

      <nav className="flex-1 overflow-y-auto p-3 space-y-1">
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
            />
          </>
        )}
      </nav>

      <div className="p-3 border-t" style={{ borderColor: "var(--sidebar-border)" }}>
        {collapsed ? (
          <button
            type="button"
            onClick={() => setCollapsed(false)}
            className="flex items-center justify-center w-full p-2.5 rounded-lg transition-colors"
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

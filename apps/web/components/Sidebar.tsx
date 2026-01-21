"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMe } from "@/lib/auth-context";

function Item({
  href,
  label,
  active,
  small = false,
}: {
  href?: string;
  label: string;
  active?: boolean;
  small?: boolean;
}) {
  const base = small ? "text-sm" : "text-sm";
  const padding = small ? "px-3 py-2" : "px-3.5 py-2.5";
  return (
    <Link
      href={href || "#"}
      className={`block ${padding} rounded-lg transition-all font-medium ${
        active 
          ? "text-primary-700 bg-primary-50 shadow-sm" 
          : "text-neutral-700 hover:bg-neutral-100 hover:text-neutral-900"
      } ${base}`}
    >
      {label}
    </Link>
  );
}

function AccordionButton({
  label,
  active,
  expanded,
  onClick,
}: {
  label: string;
  active?: boolean;
  expanded?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center justify-between px-3.5 py-2.5 rounded-lg transition-all text-sm font-medium ${
        active 
          ? "text-primary-700 bg-primary-50 shadow-sm" 
          : "text-neutral-700 hover:bg-neutral-100 hover:text-neutral-900"
      }`}
    >
      <span>{label}</span>
      <svg
        className={`h-4 w-4 transition-transform duration-200 ${expanded ? "rotate-180" : ""}`}
        viewBox="0 0 20 20"
        fill="currentColor"
        aria-hidden="true"
      >
        <path
          fillRule="evenodd"
          d="M5.23 7.21a.75.75 0 011.06.02L10 11.114l3.71-3.884a.75.75 0 011.08 1.04l-4.24 4.44a.75.75 0 01-1.08 0l-4.24-4.44a.75.75 0 01.02-1.06z"
          clipRule="evenodd"
        />
      </svg>
    </button>
  );
}

export default function Sidebar() {
  const me = useMe();
  const pathname = usePathname();
  const [ticketsOpen, setTicketsOpen] = useState(false);
  const [adminOpen, setAdminOpen] = useState(false);

  useEffect(() => {
    if (pathname.startsWith("/tickets")) {
      setTicketsOpen(true);
      setAdminOpen(false);
      return;
    }
    if (pathname.startsWith("/admin")) {
      setAdminOpen(true);
      setTicketsOpen(false);
      return;
    }
    setTicketsOpen(false);
    setAdminOpen(false);
  }, [pathname]);

  const mainNav = [
    { href: "/home", label: "HOME" },
    { href: "/tickets", label: "고객 요청" },
    { href: "/notices", label: "공지사항" },
    { href: "/faq", label: "FAQ" },
    ...(me.role === "admin" ? [{ href: "/admin", label: "관리자" }] : []),
  ];

  const ticketSubNav = [
    { href: "/tickets/new", label: "작성" },
    { href: "/tickets", label: "처리 현황" },
    { href: "/tickets/resolved", label: "처리 완료" },
    { href: "/tickets/review", label: "사업 검토" },
    { href: "/tickets/drafts", label: "임시 보관함" },
  ];

  const adminSubNav = [
    { href: "/admin", label: "대시보드" },
    { href: "/admin/users", label: "사용자 관리" },
    { href: "/admin/manager", label: "카테고리 담당자 관리" },
    { href: "/admin/tickets", label: "요청관리" },
    { href: "/admin/tickets/all", label: "모든 요청 관리" },
  ];

  const isSubActive = (href: string) => {
    if (href === "/tickets") {
      return pathname === "/tickets" || /^\/tickets\/\d+(\/edit)?$/.test(pathname);
    }
    if (href === "/tickets/new") return pathname === "/tickets/new";
    if (href.startsWith("/tickets/drafts")) return pathname.startsWith("/tickets/drafts");
    if (href.startsWith("/tickets/resolved")) return pathname.startsWith("/tickets/resolved");
    if (href.startsWith("/tickets/review")) return pathname.startsWith("/tickets/review");
    if (href === "/admin") return pathname === "/admin";
    if (href === "/admin/users") return pathname.startsWith("/admin/users");
    if (href === "/admin/tickets") {
      return pathname === "/admin/tickets" || (pathname.startsWith("/admin/tickets/") && !pathname.startsWith("/admin/tickets/all"));
    }
    if (href === "/admin/tickets/all") return pathname.startsWith("/admin/tickets/all");
    if (href === "/admin/manager") return pathname.startsWith("/admin/manager");
    return pathname === href || pathname.startsWith(`${href}/`);
  };

  const handleTicketsToggle = () => {
    setTicketsOpen((prev) => !prev);
  };

  const handleAdminToggle = () => {
    setAdminOpen((prev) => !prev);
  };

  return (
    <aside className="relative lg:fixed lg:inset-y-0 lg:left-0 w-full lg:w-72 bg-white text-neutral-900 lg:border-r border-neutral-200 z-20">
      <div className="p-3 space-y-10 flex flex-col h-full">
        <Link href="/home" className="pt-1 block no-underline">
          <div className="flex items-center w-full px-4">
            <h1 
              className="flex items-center gap-x-3 text-3xl font-black text-black uppercase tracking-tighter"
              style={{ WebkitTextStroke: '1.5px black' }}
            >
              <span>I T</span>
              <span>D E S K</span>
            </h1>
          </div>
        </Link>

        <nav className="flex-1 overflow-y-auto">
          <div className="rounded-lg bg-neutral-50/50 p-2 space-y-0.5 border border-neutral-100">
            {mainNav.map((item, idx) => {
              const isLast = idx === mainNav.length - 1;
              const divider = !isLast ? <div className="h-px bg-neutral-200 my-1" /> : null;
            if (item.href === "/tickets") {
              return (
                <div key={item.label} className="space-y-1">
                  <AccordionButton
                    label={item.label}
                    active={pathname.startsWith("/tickets")}
                    expanded={ticketsOpen}
                    onClick={handleTicketsToggle}
                  />
                  {ticketsOpen && (
                    <div className="pl-3 space-y-0.5 mt-1">
                      {ticketSubNav.map((sub) => (
                        <Item key={sub.label} href={sub.href} label={sub.label} active={isSubActive(sub.href)} small />
                      ))}
                    </div>
                  )}
                  {divider}
                </div>
              );
            }

            if (item.href === "/admin") {
              return (
                <div key={item.label} className="space-y-1">
                  <AccordionButton
                    label={item.label}
                    active={pathname.startsWith("/admin")}
                    expanded={adminOpen}
                    onClick={handleAdminToggle}
                  />
                  {adminOpen && (
                    <div className="pl-3 space-y-0.5 mt-1">
                      {adminSubNav.map((sub) => (
                        <Item key={sub.label} href={sub.href} label={sub.label} active={isSubActive(sub.href)} small />
                      ))}
                    </div>
                  )}
                  {divider}
                </div>
              );
            }

            return (
              <div key={item.label} className="space-y-1">
                <Item
                  href={item.href}
                  label={item.label}
                  active={pathname === item.href || pathname.startsWith(item.href + "/")}
                />
                {divider}
              </div>
            );
            })}
          </div>
        </nav>
        <div className="pt-1">
          <div className="flex items-center justify-center w-full">
            <Image
              src="/kdi-school-logo.png"
              alt="KDI SCHOOL"
              width={200}
              height={52}
              className="w-40 h-auto opacity-90"
            />
          </div>
        </div>
      </div>
    </aside>
  );
}

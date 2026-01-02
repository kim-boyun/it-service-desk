"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { clearToken } from "@/lib/auth";
import { useMe } from "@/lib/auth-context";

function NavItem({ href, label }: { href: string; label: string }) {
  const pathname = usePathname();
  const active = pathname === href || pathname.startsWith(href + "/");
  return (
    <Link
      href={href}
      className={`block rounded px-3 py-2 text-sm ${active ? "bg-gray-100 font-medium" : "hover:bg-gray-50"}`}
    >
      {label}
    </Link>
  );
}

export default function Sidebar() {
  const me = useMe();
  const router = useRouter();

  return (
    <aside className="border-r p-4 space-y-4">
      <div className="space-y-1">
        <div className="text-lg font-semibold">IT Service Desk</div>
        <div className="text-xs text-gray-500">
          {me.email} · {me.role}
        </div>
      </div>

      <nav className="space-y-1">
        <NavItem href="/tickets" label="티켓" />
        {me.role === "requester" && <NavItem href="/tickets/new" label="새 티켓" />}
        {(me.role === "admin") && <NavItem href="/admin" label="관리자" />}
      </nav>

      <div className="pt-2 border-t">
        <button
          className="w-full border rounded px-3 py-2 text-sm"
          onClick={() => {
            clearToken();
            router.replace("/login");
          }}
        >
          로그아웃
        </button>
      </div>
    </aside>
  );
}

"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

type NavItem = {
  label: string;
  href?: string;
  disabled?: boolean;
};

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();

  const items: NavItem[] = [
    { label: "처리현황", href: "/tickets" },
    { label: "처리완료", href: "/tickets?status=closed" },
    { label: "임시저장", disabled: true },
  ];

  return (
    <aside className="w-56 shrink-0 space-y-4">
      <button
        className="w-full rounded-md bg-teal-500 hover:bg-teal-600 text-white font-semibold py-2 shadow transition-colors"
        onClick={() => router.push("/tickets/new")}
      >
        작성
      </button>

      <div className="border-t pt-3 space-y-1">
        {items.map((item) => {
          if (item.disabled) {
            return (
              <div
                key={item.label}
                className="px-2 py-1.5 text-sm text-gray-400 cursor-not-allowed"
                title="준비 중입니다"
              >
                {item.label}
              </div>
            );
          }

          const isActive = item.href && (pathname === item.href || pathname.startsWith(item.href));
          return (
            <Link
              key={item.label}
              href={item.href ?? "#"}
              className={`block px-2 py-1.5 rounded text-sm font-medium transition-colors ${
                isActive ? "text-teal-700 bg-teal-50" : "text-gray-800 hover:text-teal-700 hover:bg-teal-50"
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </div>
    </aside>
  );
}

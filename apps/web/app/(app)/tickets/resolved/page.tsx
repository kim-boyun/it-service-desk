"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function ResolvedTicketsRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/tickets?status=resolved");
  }, [router]);

  return (
    <div className="flex items-center justify-center py-12 text-sm" style={{ color: "var(--text-tertiary)" }}>
      이동 중...
    </div>
  );
}

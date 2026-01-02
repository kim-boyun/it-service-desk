"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { clearToken, getToken } from "@/lib/auth";
import { AuthProvider, Me } from "@/lib/auth-context";

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [me, setMe] = useState<Me | null>(null);

  useEffect(() => {
    const token = getToken();
    if (!token) {
      router.replace(`/login?redirect=${encodeURIComponent(pathname)}`);
      return;
    }

    api<Me>("/me")
      .then((u) => setMe(u))
      .catch(() => {
        clearToken();
        router.replace(`/login?redirect=${encodeURIComponent(pathname)}`);
      });
  }, [router, pathname]);

  if (!me) {
    return (
      <div className="min-h-screen flex items-center justify-center text-sm text-gray-500">
        인증 확인 중...
      </div>
    );
  }

  return <AuthProvider me={me}>{children}</AuthProvider>;
}

"use client";

import { useSearchParams, useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/api";
import { setToken } from "@/lib/auth";

type LoginResponse = { access_token: string };

export default function LoginPage() {
  const router = useRouter();
  const params = useSearchParams();
  const redirect = params.get("redirect") || "/tickets";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setLoading(true);
    try {
      const res = await api<LoginResponse>("/auth/login", {
        method: "POST",
        body: { email, password },
      });
      setToken(res.access_token);
      router.replace(redirect);
    } catch (e: any) {
      setErr(e.message ?? "로그인 실패");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <form onSubmit={onSubmit} className="w-full max-w-sm space-y-4 border rounded-lg p-6">
        <div>
          <h1 className="text-xl font-semibold">IT Service Desk</h1>
          <p className="text-sm text-gray-500">계정으로 로그인하세요.</p>
        </div>

        <div className="space-y-2">
          <label className="text-sm">Email</label>
          <input className="w-full border rounded p-2" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>

        <div className="space-y-2">
          <label className="text-sm">Password</label>
          <input
            className="w-full border rounded p-2"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>

        {err && <div className="text-sm text-red-600">{err}</div>}

        <button
          className="w-full border rounded p-2 disabled:opacity-60"
          disabled={loading}
          type="submit"
        >
          {loading ? "로그인 중..." : "로그인"}
        </button>
      </form>
    </div>
  );
}

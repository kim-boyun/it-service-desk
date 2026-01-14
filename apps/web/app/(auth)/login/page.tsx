"use client";

import { useSearchParams, useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/api";
import { setToken } from "@/lib/auth";
import ErrorDialog from "@/components/ErrorDialog";

type LoginResponse = { access_token: string };

export default function LoginPage() {
  const router = useRouter();
  const params = useSearchParams();
  const redirect = params.get("redirect") || "/home";
  const presetEmployeeNo = params.get("employee_no") || "";

  const [employeeNo, setEmployeeNo] = useState(presetEmployeeNo);
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
        body: { employee_no: employeeNo, password },
      });
      setToken(res.access_token);
      router.replace(redirect);
    } catch (e: any) {
      setErr(e.message ?? "로그인에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="app-content min-h-screen flex items-center justify-center p-6 bg-gradient-to-br from-slate-50 via-white to-blue-gray-50/70">
      <ErrorDialog message={err} onClose={() => setErr(null)} />
      <form
        onSubmit={onSubmit}
        className="w-full max-w-sm space-y-5 rounded-2xl border border-blue-gray-100 bg-white/90 p-6 shadow-xl"
      >
        <div className="space-y-1 text-left">
          <h1 className="text-xl font-semibold">KDI SCHOOL</h1>
          <p className="text-base font-semibold text-slate-900">IT Service Desk</p>
        </div>

        <div className="space-y-2">
          <label className="text-sm">ID</label>
          <input
            className="w-full rounded-lg border border-blue-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400"
            value={employeeNo}
            onChange={(e) => setEmployeeNo(e.target.value)}
            autoComplete="username"
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm">Password</label>
          <input
            className="w-full rounded-lg border border-blue-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
          />
        </div>

        <button
          className="w-full rounded-lg bg-sky-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-sky-700 disabled:opacity-60"
          disabled={loading}
          type="submit"
        >
          {loading ? "로그인 중..." : "로그인"}
        </button>
      </form>
    </div>
  );
}

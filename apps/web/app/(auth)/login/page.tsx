"use client";

import { Suspense, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Image from "next/image";
import { api } from "@/lib/api";
import { setToken } from "@/lib/auth";
import ErrorDialog from "@/components/ErrorDialog";

type LoginResponse = { access_token: string };

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const redirect = params.get("redirect") || "/home";
  const presetEmpNo = params.get("emp_no") || params.get("emp_no") || "";

  const [empNo, setEmpNo] = useState(presetEmpNo);
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
        body: { emp_no: empNo, password },
      });
      setToken(res.access_token);
      router.replace(redirect);
    } catch (e: any) {
      const message = e?.message ?? "";
      const invalid = message.includes("Invalid credentials") || message.includes("401");
      setErr(invalid ? "ID 혹은 비밀번호가 잘못되었습니다." : "오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="app-content min-h-screen flex items-center justify-center p-6 bg-gradient-to-br from-slate-50 via-white to-blue-gray-50/70">
      <ErrorDialog message={err} onClose={() => setErr(null)} />
      <form
        onSubmit={onSubmit}
        onKeyDown={(event) => {
          if (err && event.key === "Enter") {
            event.preventDefault();
            setErr(null);
          }
        }}
        className="w-full max-w-sm space-y-5 rounded-2xl border border-blue-gray-100 bg-white/90 p-6 shadow-xl"
      >
        <div className="flex justify-center pb-2">
          <Image
            src="/kdis-desk-logo.png"
            alt="KDIS DESK"
            width={220}
            height={80}
            priority
            className="h-10 w-auto"
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm">ID</label>
          <input
            className="w-full rounded-lg border border-blue-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400"
            value={empNo}
            onChange={(e) => setEmpNo(e.target.value)}
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

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-sm text-gray-500">??ë?ì¤?..</div>}>
      <LoginForm />
    </Suspense>
  );
}

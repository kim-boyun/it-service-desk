"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Image from "next/image";
import { api } from "@/lib/api";
import { setToken } from "@/lib/auth";
import ErrorDialog from "@/components/ErrorDialog";

type LoginResponse = { access_token: string };

const REMEMBER_KEY = "kdis_desk_remember_id";
const EMPNO_KEY = "kdis_desk_emp_no";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const redirect = params.get("redirect") || "/home";
  const presetEmpNo = params.get("emp_no") || "";

  const [empNo, setEmpNo] = useState(presetEmpNo);
  const [password, setPassword] = useState("");
  const [rememberId, setRememberId] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const remember = localStorage.getItem(REMEMBER_KEY) === "1";
    const saved = localStorage.getItem(EMPNO_KEY) || "";
    if (remember && saved) {
      setEmpNo(saved);
      setRememberId(true);
    } else {
      setEmpNo(presetEmpNo);
      setRememberId(false);
    }
  }, [presetEmpNo]);

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

      if (typeof window !== "undefined") {
        if (rememberId) {
          localStorage.setItem(REMEMBER_KEY, "1");
          localStorage.setItem(EMPNO_KEY, empNo);
        } else {
          localStorage.removeItem(REMEMBER_KEY);
          localStorage.removeItem(EMPNO_KEY);
        }
      }

      router.replace(redirect);
    } catch (e: any) {
      const message = e?.message ?? "";
      const invalid = message.includes("Invalid credentials") || message.includes("401");
      setErr(invalid ? "ID 또는 비밀번호가 올바르지 않습니다." : "오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="app-content min-h-screen flex items-center justify-center p-6 bg-gradient-to-br from-slate-50 via-white to-blue-gray-50/70">
      <ErrorDialog message={err} onClose={() => setErr(null)} />
      <div className="w-full max-w-3xl">
        <div className="flex justify-center pb-6">
          <Image
            src="/kdis-desk-logo.png"
            alt="KDIS DESK"
            width={999}
            height={251}
            priority
            className="w-[320px] md:w-[380px] lg:w-[420px] h-auto"
          />
        </div>
        <form
          onSubmit={onSubmit}
          onKeyDown={(event) => {
            if (err && event.key === "Enter") {
              event.preventDefault();
              setErr(null);
            }
          }}
          className="w-full space-y-4 rounded-2xl border border-blue-gray-100 bg-white/90 px-8 py-7 shadow-xl"
        >
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-semibold text-slate-900">Login</h1>
          </div>

          <div className="space-y-2">
            <label className="sr-only">Id</label>
            <input
              className="w-full rounded-lg border border-blue-gray-200 bg-white px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400"
              value={empNo}
              onChange={(e) => setEmpNo(e.target.value)}
              placeholder="Id"
              autoComplete="username"
            />
          </div>

          <div className="space-y-2">
            <label className="sr-only">Password</label>
            <input
              className="w-full rounded-lg border border-blue-gray-200 bg-white px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              autoComplete="current-password"
            />
          </div>

          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-slate-300"
              checked={rememberId}
              onChange={(e) => setRememberId(e.target.checked)}
            />
            ID 저장
          </label>

          <button
            className="w-full rounded-lg bg-slate-900 px-4 py-3 text-sm font-semibold text-white shadow-sm hover:bg-slate-800 disabled:opacity-60"
            disabled={loading}
            type="submit"
          >
            {loading ? "로그인 중..." : "Login"}
          </button>
        </form>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-sm text-gray-500">로딩 중...</div>}>
      <LoginForm />
    </Suspense>
  );
}

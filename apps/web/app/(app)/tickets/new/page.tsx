"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { api } from "@/lib/api";

type TicketCreateIn = {
  title: string;
  description: string;
  priority: string;
  category: string;
};

type TicketOut = {
  id: number;
  title: string;
};

const priorities = [
  { value: "low", label: "낮음" },
  { value: "medium", label: "보통" },
  { value: "high", label: "높음" },
  { value: "urgent", label: "긴급" },
];

const categories = [
  { value: "general", label: "일반" },
  { value: "network", label: "네트워크" },
  { value: "hardware", label: "하드웨어" },
  { value: "software", label: "소프트웨어" },
  { value: "account", label: "계정/권한" },
];

export default function NewTicketPage() {
  const router = useRouter();
  const [form, setForm] = useState<TicketCreateIn>({
    title: "",
    description: "",
    priority: "medium",
    category: "general",
  });
  const [error, setError] = useState<string | null>(null);

  const createTicket = useMutation({
    mutationFn: () =>
      api<TicketOut>("/tickets", {
        method: "POST",
        body: form,
      }),
    onSuccess: (res) => {
      router.replace(`/tickets/${res.id}`);
    },
    onError: (err: any) => {
      setError(err?.message ?? "티켓 생성에 실패했습니다.");
    },
  });

  function handleChange<K extends keyof TicketCreateIn>(key: K, value: TicketCreateIn[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    createTicket.mutate();
  }

  return (
    <div className="p-6 max-w-3xl">
      <h1 className="text-2xl font-semibold mb-4">새 티켓 생성</h1>
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="space-y-2">
          <label className="text-sm font-medium">제목</label>
          <input
            className="w-full border rounded p-2"
            value={form.title}
            onChange={(e) => handleChange("title", e.target.value)}
            required
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">내용</label>
          <textarea
            className="w-full border rounded p-2 min-h-[160px]"
            value={form.description}
            onChange={(e) => handleChange("description", e.target.value)}
            required
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">우선순위</label>
            <select
              className="w-full border rounded p-2"
              value={form.priority}
              onChange={(e) => handleChange("priority", e.target.value)}
            >
              {priorities.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">카테고리</label>
            <select
              className="w-full border rounded p-2"
              value={form.category}
              onChange={(e) => handleChange("category", e.target.value)}
            >
              {categories.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {error && <div className="text-sm text-red-600">{error}</div>}

        <div className="flex items-center gap-2">
          <button
            type="submit"
            className="border rounded px-4 py-2 text-sm bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60"
            disabled={createTicket.isPending}
          >
            {createTicket.isPending ? "생성 중..." : "등록"}
          </button>
          <button
            type="button"
            className="text-sm text-gray-600 hover:underline"
            onClick={() => router.back()}
            disabled={createTicket.isPending}
          >
            취소
          </button>
        </div>
      </form>
    </div>
  );
}

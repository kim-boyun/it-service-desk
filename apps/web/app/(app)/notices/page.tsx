"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useMe } from "@/lib/auth-context";
import { api } from "@/lib/api";
import { extractText, TiptapDoc } from "@/lib/tiptap";
import PageHeader from "@/components/PageHeader";

type Notice = {
  id: number;
  title: string;
  body: TiptapDoc;
  created_at: string;
  updated_at: string;
};

function formatDate(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleString();
}

export default function NoticesPage() {
  const me = useMe();
  const router = useRouter();
  const [notices, setNotices] = useState<Notice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const canEdit = useMemo(() => me.role === "admin", [me.role]);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    api<Notice[]>("/notices")
      .then((data) => {
        if (!alive) return;
        setNotices(data);
        setError(null);
      })
      .catch((e: any) => {
        if (!alive) return;
        setError(e.message ?? "\uacf5\uc9c0\uc0ac\ud56d\uc744 \ubd88\ub7ec\uc624\uc9c0 \ubabb\ud588\uc2b5\ub2c8\ub2e4.");
      })
      .finally(() => {
        if (!alive) return;
        setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  const excerpt = (text: string) => (text.length > 80 ? `${text.slice(0, 80)}...` : text);

  return (
    <div className="space-y-6">
      <PageHeader
        title="\uacf5\uc9c0\uc0ac\ud56d"
        subtitle="\uc8fc\uc694 \uacf5\uc9c0 \ubc0f \uc6b4\uc601 \uc548\ub0b4\ub97c \ud655\uc778\ud558\uc138\uc694."
        actions={
          canEdit ? (
            <button
              className="inline-flex items-center gap-2 rounded-lg bg-neutral-900 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-neutral-800 transition-colors"
              onClick={() => router.push("/notices/new")}
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              \ub4f1\ub85d
            </button>
          ) : null
        }
      />

      {error && (
        <div className="rounded-lg bg-danger-50 border border-danger-200 px-4 py-3 text-sm text-danger-700">
          {error}
        </div>
      )}

      {loading ? (
        <div className="border border-neutral-200 rounded-xl px-4 py-8 text-center text-sm text-neutral-500 bg-white shadow-sm">
          \uacf5\uc9c0\uc0ac\ud56d\uc744 \ubd88\ub7ec\uc624\ub294 \uc911\uc785\ub2c8\ub2e4...
        </div>
      ) : notices.length === 0 ? (
        <div className="border border-neutral-200 rounded-xl px-4 py-12 text-center bg-white shadow-sm">
          <div className="text-neutral-400 mb-2">
            <svg className="mx-auto h-12 w-12" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="1.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
            </svg>
          </div>
          <p className="text-sm text-neutral-500">\ub4f1\ub85d\ub41c \uacf5\uc9c0\uc0ac\ud56d\uc774 \uc5c6\uc2b5\ub2c8\ub2e4.</p>
        </div>
      ) : (
        <div className="border border-neutral-200 rounded-xl divide-y divide-neutral-100 bg-white shadow-sm overflow-hidden">
          {notices.map((n) => (
            <button
              key={n.id}
              className="w-full text-left px-5 py-4 space-y-2 hover:bg-neutral-50 transition-colors group"
              onClick={() => router.push(`/notices/${n.id}`)}
            >
              <div className="flex items-start justify-between gap-4">
                <h3 className="text-base font-semibold text-neutral-900 group-hover:text-primary-600 transition-colors line-clamp-1">
                  {n.title}
                </h3>
                <span className="text-xs text-neutral-500 whitespace-nowrap">{formatDate(n.created_at)}</span>
              </div>
              <p className="text-sm text-neutral-600 line-clamp-2 leading-relaxed">{excerpt(extractText(n.body))}</p>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

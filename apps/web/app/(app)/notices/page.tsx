"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useMe } from "@/lib/auth-context";
import { api } from "@/lib/api";
import { extractText, TiptapDoc } from "@/lib/tiptap";
import PageHeader from "@/components/PageHeader";
import { Card } from "@/components/ui";
import { Plus, FileText } from "lucide-react";

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
        setError(e.message ?? "공지사항을 불러오지 못했습니다.");
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
    <div className="space-y-6 animate-fadeIn">
      <PageHeader
        title="공지사항"
        subtitle="주요 공지 및 운영 안내를 확인하세요."
        icon="📢"
        actions={
          canEdit ? (
            <button
              className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold shadow-sm transition-all"
              style={{
                background: "linear-gradient(135deg, var(--color-primary-600) 0%, var(--color-primary-700) 100%)",
                color: "white",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = "translateY(-1px)";
                e.currentTarget.style.boxShadow = "var(--shadow-md)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = "translateY(0)";
                e.currentTarget.style.boxShadow = "var(--shadow-sm)";
              }}
              onClick={() => router.push("/notices/new")}
            >
              <Plus className="h-4 w-4" />
              등록
            </button>
          ) : null
        }
      />

      {error && (
        <div
          className="rounded-lg border px-4 py-3 text-sm"
          style={{
            backgroundColor: "var(--color-danger-50)",
            borderColor: "var(--color-danger-200)",
            color: "var(--color-danger-700)",
          }}
        >
          {error}
        </div>
      )}

      {loading ? (
        <Card padding="lg">
          <div className="text-center text-sm" style={{ color: "var(--text-secondary)" }}>
            공지사항을 불러오는 중입니다...
          </div>
        </Card>
      ) : notices.length === 0 ? (
        <Card padding="xl">
          <div className="text-center">
            <div className="mb-3" style={{ color: "var(--text-tertiary)" }}>
              <FileText className="mx-auto h-12 w-12" strokeWidth={1.5} />
            </div>
            <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
              등록된 공지사항이 없습니다.
            </p>
          </div>
        </Card>
      ) : (
        <Card padding="none" className="divide-y overflow-hidden" style={{ borderColor: "var(--border-default)" }}>
          {notices.map((n) => (
            <button
              key={n.id}
              className="w-full text-left px-5 py-4 space-y-2 transition-colors group"
              style={{
                borderColor: "var(--border-subtle)",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = "var(--bg-hover)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = "transparent";
              }}
              onClick={() => router.push(`/notices/${n.id}`)}
            >
              <div className="flex items-start justify-between gap-4">
                <h3
                  className="text-base font-semibold transition-colors line-clamp-1"
                  style={{ color: "var(--text-primary)" }}
                >
                  {n.title}
                </h3>
                <span className="text-xs whitespace-nowrap" style={{ color: "var(--text-tertiary)" }}>
                  {formatDate(n.created_at)}
                </span>
              </div>
              <p className="text-sm line-clamp-2 leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                {excerpt(extractText(n.body))}
              </p>
            </button>
          ))}
        </Card>
      )}
    </div>
  );
}

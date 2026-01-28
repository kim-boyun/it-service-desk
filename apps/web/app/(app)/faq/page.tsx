"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { useMe } from "@/lib/auth-context";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { TiptapDoc } from "@/lib/tiptap";
import PageHeader from "@/components/PageHeader";
import { Card, Badge, Select } from "@/components/ui";
import { Plus, HelpCircle, ChevronDown, Edit, Trash2 } from "lucide-react";

const TiptapViewer = dynamic(() => import("@/components/TiptapViewer"), { ssr: false });

type Faq = {
  id: number;
  question: string;
  answer: TiptapDoc;
  category_id: number | null;
  category_name: string | null;
  category_code: string | null;
  created_at: string;
  updated_at: string;
};

type TicketCategory = {
  id: number;
  code: string;
  name: string;
  description?: string | null;
};

export default function FaqPage() {
  const me = useMe();
  const router = useRouter();
  const [faqs, setFaqs] = useState<Faq[]>([]);
  const [categories, setCategories] = useState<TicketCategory[]>([]);
  const [openId, setOpenId] = useState<number | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const canEdit = useMemo(() => me.role === "admin", [me.role]);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    Promise.all([api<Faq[]>("/faqs"), api<TicketCategory[]>("/ticket-categories")])
      .then(([faqData, categoryData]) => {
        if (!alive) return;
        setFaqs(faqData);
        setCategories(categoryData);
        setError(null);
      })
      .catch((e: any) => {
        if (!alive) return;
        setError(e.message ?? "FAQ를 불러오지 못했습니다.");
      })
      .finally(() => {
        if (!alive) return;
        setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  const toggle = (id: number) => setOpenId((prev) => (prev === id ? null : id));

  const handleDelete = async (id: number) => {
    if (!confirm("삭제하시겠습니까?")) return;
    try {
      await api(`/faqs/${id}`, { method: "DELETE" });
      setFaqs((prev) => prev.filter((f) => f.id !== id));
    } catch (e: any) {
      setError(e.message ?? "삭제에 실패했습니다.");
    }
  };

  const handleEdit = (id: number) => {
    router.push(`/faq/${id}/edit`);
  };

  const filteredFaqs = useMemo(() => {
    if (categoryFilter === "all") return faqs;
    const id = Number(categoryFilter);
    return faqs.filter((f) => f.category_id === id);
  }, [faqs, categoryFilter]);

  return (
    <div className="space-y-6 animate-fadeIn">
      <PageHeader
        title="자주 묻는 질문"
        subtitle="빠르게 해결되는 기본 안내를 확인하세요"
        icon={<HelpCircle className="h-7 w-7" strokeWidth={2} />}
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
              onClick={() => router.push("/faq/new")}
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

      <Card padding="md">
        <div className="flex items-center gap-3">
          <label htmlFor="category-filter" className="text-sm font-medium" style={{ color: "var(--text-secondary)" }}>
            카테고리
          </label>
          <select
            id="category-filter"
            className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 transition-all"
            style={{
              borderColor: "var(--border-default)",
              backgroundColor: "var(--bg-card)",
              color: "var(--text-primary)",
            }}
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
          >
            <option value="all">전체</option>
            {categories.map((c) => (
              <option key={c.id} value={String(c.id)}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      </Card>

      {loading ? (
        <Card padding="lg">
          <div className="text-center text-sm" style={{ color: "var(--text-secondary)" }}>
            FAQ를 불러오는 중입니다...
          </div>
        </Card>
      ) : filteredFaqs.length === 0 ? (
        <Card padding="lg">
          <div className="text-center">
            <div className="mb-3" style={{ color: "var(--text-tertiary)" }}>
              <HelpCircle className="mx-auto h-12 w-12" strokeWidth={1.5} />
            </div>
            <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
              등록된 FAQ가 없습니다
            </p>
          </div>
        </Card>
      ) : (
        <div className="space-y-3">
          {filteredFaqs.map((f) => {
            const open = openId === f.id;
            const categoryLabel = f.category_name || "기타";
            return (
              <Card key={f.id} padding="none" className="overflow-hidden">
                <div className="px-5 py-4 flex items-start justify-between gap-4">
                  <button className="text-left flex-1 group" onClick={() => toggle(f.id)} aria-expanded={open}>
                    <div className="flex items-start gap-3">
                      <Badge variant="primary" size="sm">
                        {categoryLabel}
                      </Badge>
                      <div className="flex items-start gap-2 flex-1">
                        <span className="text-sm font-semibold transition-colors" style={{ color: "var(--text-primary)" }}>
                          {f.question}
                        </span>
                        <ChevronDown
                          className={`h-5 w-5 transition-transform flex-shrink-0 ${open ? "rotate-180" : ""}`}
                          style={{ color: "var(--text-tertiary)" }}
                        />
                      </div>
                    </div>
                  </button>
                  {canEdit && (
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <button
                        className="px-3 py-1.5 text-xs font-medium rounded-lg border transition-all inline-flex items-center gap-1.5"
                        style={{
                          borderColor: "var(--border-default)",
                          backgroundColor: "var(--bg-card)",
                          color: "var(--text-secondary)",
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.backgroundColor = "var(--bg-hover)";
                          e.currentTarget.style.color = "var(--text-primary)";
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.backgroundColor = "var(--bg-card)";
                          e.currentTarget.style.color = "var(--text-secondary)";
                        }}
                        onClick={() => handleEdit(f.id)}
                      >
                        <Edit className="w-3 h-3" />
                        수정
                      </button>
                      <button
                        className="px-3 py-1.5 text-xs font-medium rounded-lg border transition-all inline-flex items-center gap-1.5"
                        style={{
                          borderColor: "var(--color-danger-300)",
                          backgroundColor: "var(--color-danger-50)",
                          color: "var(--color-danger-700)",
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.backgroundColor = "var(--color-danger-100)";
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.backgroundColor = "var(--color-danger-50)";
                        }}
                        onClick={() => handleDelete(f.id)}
                      >
                        <Trash2 className="w-3 h-3" />
                        삭제
                      </button>
                    </div>
                  )}
                </div>
                {open && (
                  <div
                    className="px-5 pb-5 pt-2 border-t"
                    style={{
                      borderColor: "var(--border-subtle)",
                      backgroundColor: "var(--bg-subtle)",
                    }}
                  >
                    <div className="text-sm leading-relaxed prose prose-sm max-w-none" style={{ color: "var(--text-primary)" }}>
                      <TiptapViewer value={f.answer} />
                    </div>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

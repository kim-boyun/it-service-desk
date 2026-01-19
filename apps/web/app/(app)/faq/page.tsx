"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { useMe } from "@/lib/auth-context";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { TiptapDoc } from "@/lib/tiptap";
import PageHeader from "@/components/PageHeader";

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
    <div className="space-y-6">
      <PageHeader
        title="자주 묻는 질문"
        subtitle="빠르게 해결되는 기본 안내를 확인하세요"
        actions={
          canEdit ? (
            <button
              className="inline-flex items-center gap-2 rounded-lg bg-neutral-900 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-neutral-800 transition-colors"
              onClick={() => router.push("/faq/new")}
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              등록
            </button>
          ) : null
        }
      />

      {error && (
        <div className="rounded-lg bg-danger-50 border border-danger-200 px-4 py-3 text-sm text-danger-700">
          {error}
        </div>
      )}

      <div className="flex items-center gap-2">
        <label htmlFor="category-filter" className="text-sm font-medium text-neutral-700">카테고리</label>
        <select
          id="category-filter"
          className="border border-neutral-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
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

      {loading ? (
        <div className="border border-neutral-200 rounded-xl px-4 py-8 text-center text-sm text-neutral-500 bg-white shadow-sm">
          FAQ를 불러오는 중입니다...
        </div>
      ) : filteredFaqs.length === 0 ? (
        <div className="border border-neutral-200 rounded-xl px-4 py-12 text-center bg-white shadow-sm">
          <div className="text-neutral-400 mb-2">
            <svg className="mx-auto h-12 w-12" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="1.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z" />
            </svg>
          </div>
          <p className="text-sm text-neutral-500">등록된 FAQ가 없습니다</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredFaqs.map((f) => {
            const open = openId === f.id;
            const categoryLabel = f.category_name || "기타";
            return (
              <div key={f.id} className="border border-neutral-200 rounded-xl bg-white overflow-hidden shadow-sm">
                <div className="px-5 py-4 flex items-start justify-between gap-4">
                  <button 
                    className="text-left flex-1 group" 
                    onClick={() => toggle(f.id)}
                    aria-expanded={open}
                  >
                    <div className="flex items-start gap-3">
                      <span className="inline-flex items-center px-2.5 py-1 text-xs font-medium rounded-full bg-primary-50 text-primary-700 border border-primary-200">
                        {categoryLabel}
                      </span>
                      <div className="flex items-start gap-2 flex-1">
                        <span className="text-sm font-semibold text-neutral-900 group-hover:text-primary-600 transition-colors">
                          {f.question}
                        </span>
                        <svg 
                          className={`h-5 w-5 text-neutral-400 transition-transform flex-shrink-0 ${open ? "rotate-180" : ""}`} 
                          fill="none" 
                          stroke="currentColor" 
                          viewBox="0 0 24 24"
                          strokeWidth="2"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                        </svg>
                      </div>
                    </div>
                  </button>
                  {canEdit && (
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <button
                        className="px-3 py-1.5 text-xs font-medium rounded-lg border border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-50 transition-colors"
                        onClick={() => handleEdit(f.id)}
                      >
                        수정
                      </button>
                      <button
                        className="px-3 py-1.5 text-xs font-medium rounded-lg bg-danger-600 text-white hover:bg-danger-700 transition-colors shadow-sm"
                        onClick={() => handleDelete(f.id)}
                      >
                        삭제
                      </button>
                    </div>
                  )}
                </div>
                {open && (
                  <div className="px-5 pb-5 pt-2 border-t border-neutral-100 bg-neutral-50/50">
                    <div className="text-sm text-neutral-700 leading-relaxed prose prose-sm max-w-none">
                      <TiptapViewer value={f.answer} />
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { useParams, useRouter } from "next/navigation";
import { useMe } from "@/lib/auth-context";
import { api } from "@/lib/api";
import { EMPTY_DOC, isEmptyDoc, TiptapDoc } from "@/lib/tiptap";

const RichTextEditor = dynamic(() => import("@/components/RichTextEditor"), { ssr: false });

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

function isConflict(err: any) {
  return typeof err?.message === "string" && err.message.includes("409");
}

export default function EditFaqPage() {
  const me = useMe();
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const faqId = Number(params.id);

  const [faq, setFaq] = useState<Faq | null>(null);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<TiptapDoc>(EMPTY_DOC);
  const [categoryId, setCategoryId] = useState<string>("none");
  const [newCategory, setNewCategory] = useState("");
  const [categories, setCategories] = useState<TicketCategory[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  const canEdit = useMemo(() => me.role === "admin", [me.role]);

  useEffect(() => {
    if (!canEdit) {
      router.replace("/faq");
      return;
    }
    let alive = true;
    setLoading(true);
    Promise.all([api<Faq>(`/faqs/${faqId}`), api<TicketCategory[]>("/ticket-categories")])
      .then(([faqData, categoryData]) => {
        if (!alive) return;
        setFaq(faqData);
        setQuestion(faqData.question);
        setAnswer(faqData.answer);
        setCategoryId(faqData.category_id ? String(faqData.category_id) : "none");
        setCategories(categoryData);
        setErr(null);
      })
      .catch((e: any) => {
        if (!alive) return;
        setErr(e.message ?? "FAQ를 불러오지 못했습니다.");
      })
      .finally(() => {
        if (!alive) return;
        setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [canEdit, faqId, router]);

  const resolveCategoryId = async () => {
    const trimmed = newCategory.trim();
    if (trimmed) {
      try {
        const created = await api<TicketCategory>("/ticket-categories", {
          method: "POST",
          body: { code: trimmed, name: trimmed, description: null },
        });
        return created.id;
      } catch (e: any) {
        if (isConflict(e)) {
          const fresh = await api<TicketCategory[]>("/ticket-categories");
          setCategories(fresh);
          const found = fresh.find((c) => c.code === trimmed || c.name === trimmed);
          return found?.id ?? null;
        }
        throw e;
      }
    }
    if (categoryId !== "none") return Number(categoryId);
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    const trimmedQ = question.trim();
    if (!trimmedQ || isEmptyDoc(answer)) {
      setErr("질문과 답변을 입력하세요.");
      return;
    }
    setSaving(true);
    try {
      const resolvedCategoryId = await resolveCategoryId();
      const updated = await api<Faq>(`/faqs/${faqId}`,
        {
          method: "PATCH",
          body: {
            question: trimmedQ,
            answer,
            category_id: resolvedCategoryId,
          },
        }
      );
      setFaq(updated);
      router.replace("/faq");
    } catch (e: any) {
      setErr(e.message ?? "FAQ 수정에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  };

  if (!canEdit) return null;

  if (loading) {
    return <div className="p-6 text-sm text-gray-500">FAQ를 불러오는 중입니다...</div>;
  }

  if (!faq) {
    return (
      <div className="p-6 space-y-2">
        <div className="text-sm text-gray-500">FAQ를 찾을 수 없습니다.</div>
        <button className="text-sm text-blue-700 underline" onClick={() => router.push("/faq")}>
          목록으로
        </button>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-3xl">
      <h1 className="text-2xl font-semibold mb-4">FAQ 수정</h1>
      <form onSubmit={handleSubmit} className="space-y-4 border rounded-lg bg-white p-4 shadow-sm">
        <div className="space-y-1">
          <label className="text-sm text-gray-700">질문</label>
          <input
            className="w-full border rounded px-3 py-2 text-sm"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="질문을 입력하세요."
          />
        </div>
        <div className="space-y-1">
          <label className="text-sm text-gray-700">답변</label>
          <RichTextEditor value={answer} onChange={setAnswer} onError={setErr} placeholder="답변을 입력하세요." />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-sm text-gray-700">카테고리 선택</label>
            <select
              className="w-full border rounded px-3 py-2 text-sm"
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
            >
              <option value="none">미선택</option>
              {categories.map((c) => (
                <option key={c.id} value={String(c.id)}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-sm text-gray-700">새 카테고리 (선택)</label>
            <input
              className="w-full border rounded px-3 py-2 text-sm"
              value={newCategory}
              onChange={(e) => setNewCategory(e.target.value)}
              placeholder="새 카테고리명을 입력"
            />
          </div>
        </div>

        {err && <div className="text-sm text-red-600">{err}</div>}
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            className="px-4 py-2 text-sm rounded border bg-white text-black hover:bg-gray-100 transition"
            onClick={() => router.back()}
            disabled={saving}
          >
            취소
          </button>
          <button
            type="submit"
            className="px-4 py-2 text-sm rounded border bg-white text-black hover:bg-gray-100 transition"
            disabled={saving}
          >
            저장
          </button>
        </div>
      </form>
    </div>
  );
}

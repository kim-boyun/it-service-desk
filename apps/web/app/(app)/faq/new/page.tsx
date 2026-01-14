"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useMe } from "@/lib/auth-context";
import { api } from "@/lib/api";
import { EMPTY_DOC, isEmptyDoc, TiptapDoc } from "@/lib/tiptap";
import PageHeader from "@/components/PageHeader";
import { useUnsavedChangesWarning } from "@/lib/use-unsaved-changes";

const RichTextEditor = dynamic(() => import("@/components/RichTextEditor"), { ssr: false });

type TicketCategory = {
  id: number;
  code: string;
  name: string;
  description?: string | null;
};

const UNSAVED_MESSAGE = "이 페이지를 떠나시겠습니까?\n변경사항이 저장되지 않을 수 있습니다.";

function isConflict(err: any) {
  return typeof err?.message === "string" && err.message.includes("409");
}

export default function NewFaqPage() {
  const me = useMe();
  const router = useRouter();

  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<TiptapDoc>(EMPTY_DOC);
  const [categoryId, setCategoryId] = useState<string>("none");
  const [newCategory, setNewCategory] = useState("");
  const [categories, setCategories] = useState<TicketCategory[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [isDirty, setIsDirty] = useState(false);

  const canEdit = useMemo(() => me.role === "admin", [me.role]);

  useUnsavedChangesWarning(isDirty);

  useEffect(() => {
    if (!canEdit) {
      router.replace("/faq");
      return;
    }
    api<TicketCategory[]>("/ticket-categories")
      .then(setCategories)
      .catch(() => {
        setCategories([]);
      });
  }, [canEdit, router]);

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
      await api("/faqs", {
        method: "POST",
        body: {
          question: trimmedQ,
          answer,
          category_id: resolvedCategoryId,
        },
      });
      setIsDirty(false);
      router.replace("/faq");
    } catch (e: any) {
      setErr(e.message ?? "FAQ 등록에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  };

  if (!canEdit) return null;

  return (
    <div className="p-5 space-y-5">
      <PageHeader title="FAQ 등록" />
      <form onSubmit={handleSubmit} className="space-y-5 border border-slate-200/70 rounded-2xl bg-white p-5 shadow-sm">
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <label className="text-sm text-slate-700">질문</label>
            <span className="text-xs text-slate-500">{question.length}/255</span>
          </div>
          <input
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
            value={question}
            onChange={(e) => {
              setQuestion(e.target.value);
              setIsDirty(true);
            }}
            placeholder="질문을 입력하세요."
            maxLength={255}
          />
        </div>
        <div className="space-y-1">
          <label className="text-sm text-slate-700">답변</label>
          <RichTextEditor
            value={answer}
            onChange={(next) => {
              setAnswer(next);
              setIsDirty(true);
            }}
            onError={setErr}
            placeholder="답변을 입력하세요."
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1">
            <label className="text-sm text-slate-700">카테고리 선택</label>
            <select
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
              value={categoryId}
              onChange={(e) => {
                setCategoryId(e.target.value);
                setIsDirty(true);
              }}
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
            <label className="text-sm text-slate-700">새 카테고리 (선택)</label>
            <input
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
              value={newCategory}
              onChange={(e) => {
                setNewCategory(e.target.value);
                setIsDirty(true);
              }}
              placeholder="새 카테고리명을 입력"
            />
          </div>
        </div>

        {err && <div className="text-sm text-red-600">{err}</div>}
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            className="px-4 py-2 text-sm rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 transition"
            onClick={() => {
              if (isDirty && !confirm(UNSAVED_MESSAGE)) return;
              router.back();
            }}
            disabled={saving}
          >
            취소
          </button>
          <button
            type="submit"
            className="px-4 py-2 text-sm rounded-lg bg-slate-900 text-white hover:bg-slate-800 transition"
            disabled={saving}
          >
            등록
          </button>
        </div>
      </form>
    </div>
  );
}

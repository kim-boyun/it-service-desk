"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useMe } from "@/lib/auth-context";
import { api } from "@/lib/api";
import { EMPTY_DOC, isEmptyDoc, TiptapDoc } from "@/lib/tiptap";
import PageHeader from "@/components/PageHeader";
import { useUnsavedChangesWarning } from "@/lib/use-unsaved-changes";
import { Card } from "@/components/ui";
import { HelpCircle, ArrowLeft, Save } from "lucide-react";

const RichTextEditor = dynamic(() => import("@/components/RichTextEditor"), { ssr: false });

const UNSAVED_MESSAGE = "이 페이지를 떠나시겠습니까?\n변경사항이 저장되지 않을 수 있습니다.";


export default function NewFaqPage() {
  const me = useMe();
  const router = useRouter();

  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<TiptapDoc>(EMPTY_DOC);
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [isDirty, setIsDirty] = useState(false);

  const canEdit = useMemo(() => me.role === "admin", [me.role]);

  useUnsavedChangesWarning(isDirty);

  useEffect(() => {
    if (!canEdit) {
      router.replace("/faq");
    }
  }, [canEdit, router]);


  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    const trimmedQ = question.trim();
    if (!trimmedQ || isEmptyDoc(answer)) {
      setErr("질문과 답변을 입력하세요.");
      return;
    }
    if (!confirm("등록하시겠습니까?")) return;

    setSaving(true);
    try {
      const resolvedCategoryId = null;
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
    <div className="space-y-6 animate-fadeIn">
      <PageHeader
        title="FAQ 등록"
        subtitle="자주 묻는 질문을 추가합니다."
        icon={<HelpCircle className="h-7 w-7" strokeWidth={2} />}
        actions={
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors"
            style={{
              borderColor: "var(--border-default)",
              backgroundColor: "var(--bg-card)",
              color: "var(--text-secondary)",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "var(--bg-hover)")}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "var(--bg-card)")}
            onClick={() => {
              if (isDirty && !confirm(UNSAVED_MESSAGE)) return;
              router.back();
            }}
            disabled={saving}
          >
            <ArrowLeft className="h-4 w-4" />
            돌아가기
          </button>
        }
      />

      <Card padding="none" className="overflow-hidden max-w-3xl">
        <form onSubmit={handleSubmit}>
          <div className="px-6 py-4 border-b" style={{ borderColor: "var(--border-default)" }}>
            <div className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
              기본 정보
            </div>
          </div>

          <div className="px-6 py-5 space-y-5">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium" style={{ color: "var(--text-secondary)" }}>
                  질문
                </label>
                <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>
                  {question.length}/255
                </span>
              </div>
              <input
                className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 transition-all"
                style={{
                  borderColor: "var(--border-default)",
                  backgroundColor: "var(--bg-card)",
                  color: "var(--text-primary)",
                }}
                value={question}
                onChange={(e) => {
                  setQuestion(e.target.value);
                  setIsDirty(true);
                }}
                placeholder="질문을 입력하세요."
                maxLength={255}
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium" style={{ color: "var(--text-secondary)" }}>
                답변
              </label>
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

            {err && (
              <div
                className="rounded-lg border px-4 py-3 text-sm"
                style={{
                  backgroundColor: "var(--color-danger-50)",
                  borderColor: "var(--color-danger-200)",
                  color: "var(--color-danger-700)",
                }}
              >
                {err}
              </div>
            )}
          </div>

          <div
            className="px-6 py-4 border-t flex items-center justify-end gap-2"
            style={{ borderColor: "var(--border-default)" }}
          >
            <button
              type="submit"
              className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold shadow-sm transition-all"
              style={{
                background: "linear-gradient(135deg, var(--color-primary-600) 0%, var(--color-primary-700) 100%)",
                color: "white",
              }}
              disabled={saving}
            >
              <Save className="h-4 w-4" />
              등록
            </button>
          </div>
        </form>
      </Card>
    </div>
  );
}

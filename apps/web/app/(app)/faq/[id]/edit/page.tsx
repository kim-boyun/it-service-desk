"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { useParams, useRouter } from "next/navigation";
import PageHeader from "@/components/PageHeader";
import { useMe } from "@/lib/auth-context";
import { api } from "@/lib/api";
import { EMPTY_DOC, isEmptyDoc, TiptapDoc } from "@/lib/tiptap";
import { Card, Badge } from "@/components/ui";
import { HelpCircle, ArrowLeft, Save } from "lucide-react";

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

export default function EditFaqPage() {
  const me = useMe();
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const faqId = Number(params.id);

  const [faq, setFaq] = useState<Faq | null>(null);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<TiptapDoc>(EMPTY_DOC);
  const [categoryId, setCategoryId] = useState<string>("none");
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
    api<Faq>(`/faqs/${faqId}`)
      .then((faqData) => {
        if (!alive) return;
        setFaq(faqData);
        setQuestion(faqData.question);
        setAnswer(faqData.answer);
        setCategoryId(faqData.category_id ? String(faqData.category_id) : "none");
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    const trimmedQ = question.trim();
    if (!trimmedQ || isEmptyDoc(answer)) {
      setErr("질문과 답변을 입력하세요.");
      return;
    }
    if (!confirm("변경을 저장하시겠습니까?")) return;
    setSaving(true);
    try {
      const resolvedCategoryId = categoryId !== "none" ? Number(categoryId) : null;
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
    return (
      <div className="space-y-6 animate-fadeIn">
        <Card padding="lg">
          <div className="text-center text-sm" style={{ color: "var(--text-secondary)" }}>
            FAQ를 불러오는 중입니다...
          </div>
        </Card>
      </div>
    );
  }

  if (!faq) {
    return (
      <div className="space-y-6 animate-fadeIn">
        <Card padding="lg">
          <div className="space-y-2">
            <div className="text-sm" style={{ color: "var(--text-secondary)" }}>
              FAQ를 찾을 수 없습니다.
            </div>
            <button
              className="inline-flex items-center gap-2 text-sm font-medium"
              style={{ color: "var(--color-primary-700)" }}
              onClick={() => router.push("/faq")}
            >
              <ArrowLeft className="h-4 w-4" />
              목록으로
            </button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fadeIn">
      <PageHeader
        title="FAQ 수정"
        subtitle="질문과 답변을 수정합니다."
        icon={<HelpCircle className="h-7 w-7" strokeWidth={2} />}
        meta={
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="neutral" size="sm">
              FAQ #{faq.id}
            </Badge>
          </div>
        }
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
            onClick={() => router.push("/faq")}
            disabled={saving}
          >
            <ArrowLeft className="h-4 w-4" />
            목록
          </button>
        }
      />

      <Card padding="none" className="overflow-hidden max-w-3xl">
        <form onSubmit={handleSubmit}>
          <div className="px-6 py-4 border-b" style={{ borderColor: "var(--border-default)" }}>
            <div className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
              내용 수정
            </div>
          </div>

          <div className="px-6 py-5 space-y-5">
            <div className="space-y-2">
              <label className="text-sm font-medium" style={{ color: "var(--text-secondary)" }}>
                질문
              </label>
              <input
                className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 transition-all"
                style={{
                  borderColor: "var(--border-default)",
                  backgroundColor: "var(--bg-card)",
                  color: "var(--text-primary)",
                }}
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder="질문을 입력하세요."
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium" style={{ color: "var(--text-secondary)" }}>
                답변
              </label>
              <RichTextEditor value={answer} onChange={setAnswer} onError={setErr} placeholder="답변을 입력하세요." />
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
              저장
            </button>
          </div>
        </form>
      </Card>
    </div>
  );
}

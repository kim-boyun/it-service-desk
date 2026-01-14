"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useMe } from "@/lib/auth-context";
import { api } from "@/lib/api";
import { EMPTY_DOC, isEmptyDoc, TiptapDoc } from "@/lib/tiptap";
import PageHeader from "@/components/PageHeader";
import { useUnsavedChangesWarning } from "@/lib/use-unsaved-changes";

const RichTextEditor = dynamic(() => import("@/components/RichTextEditor"), { ssr: false });

const UNSAVED_MESSAGE = "이 페이지를 떠나시겠습니까?\n변경사항이 저장되지 않을 수 있습니다.";

export default function NewNoticePage() {
  const me = useMe();
  const router = useRouter();

  const [title, setTitle] = useState("");
  const [body, setBody] = useState<TiptapDoc>(EMPTY_DOC);
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [isDirty, setIsDirty] = useState(false);

  const canEdit = me.role === "admin";

  useUnsavedChangesWarning(isDirty);

  useEffect(() => {
    if (!canEdit) {
      router.replace("/notices");
    }
  }, [canEdit, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    const trimmedTitle = title.trim();
    if (!trimmedTitle || isEmptyDoc(body)) {
      setErr("제목과 내용을 입력하세요.");
      return;
    }

    setSaving(true);
    try {
      await api("/notices", {
        method: "POST",
        body: { title: trimmedTitle, body },
      });
      setIsDirty(false);
      router.replace("/notices");
    } catch (e: any) {
      setErr(e.message ?? "공지 등록에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  };

  if (!canEdit) return null;

  return (
    <div className="p-5 space-y-5">
      <PageHeader title="공지 등록" />
      <form onSubmit={handleSubmit} className="space-y-5 border border-slate-200/70 rounded-2xl bg-white p-5 shadow-sm">
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <label className="text-sm text-slate-700">제목</label>
            <span className="text-xs text-slate-500">{title.length}/255</span>
          </div>
          <input
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              setIsDirty(true);
            }}
            placeholder="제목을 입력하세요."
            maxLength={255}
          />
        </div>
        <div className="space-y-1">
          <label className="text-sm text-slate-700">내용</label>
          <RichTextEditor
            value={body}
            onChange={(next) => {
              setBody(next);
              setIsDirty(true);
            }}
            placeholder="공지 내용을 입력하세요."
            onError={setErr}
          />
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

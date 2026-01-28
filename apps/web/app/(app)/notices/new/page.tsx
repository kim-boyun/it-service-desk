"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useMe } from "@/lib/auth-context";
import { api, apiForm } from "@/lib/api";
import { EMPTY_DOC, isEmptyDoc, TiptapDoc } from "@/lib/tiptap";
import PageHeader from "@/components/PageHeader";
import { useUnsavedChangesWarning } from "@/lib/use-unsaved-changes";
import { Card } from "@/components/ui";
import { Megaphone, ArrowLeft, Save } from "lucide-react";

const RichTextEditor = dynamic(() => import("@/components/RichTextEditor"), { ssr: false });

const UNSAVED_MESSAGE = "이 페이지를 나가시겠습니까?\n변경사항이 저장되지 않을 수 있습니다.";
const MAX_FILE_BYTES = 25 * 1024 * 1024;

type NoticeOut = {
  id: number;
};

function formatBytes(bytes: number) {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(k)), sizes.length - 1);
  const value = bytes / Math.pow(k, i);
  return `${value.toFixed(value >= 10 || i === 0 ? 0 : 1)} ${sizes[i]}`;
}

export default function NewNoticePage() {
  const me = useMe();
  const router = useRouter();

  const [title, setTitle] = useState("");
  const [body, setBody] = useState<TiptapDoc>(EMPTY_DOC);
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [attachments, setAttachments] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [dragActive, setDragActive] = useState(false);

  const canEdit = me.role === "admin";

  useUnsavedChangesWarning(isDirty);

  useEffect(() => {
    if (!canEdit) {
      router.replace("/notices");
    }
  }, [canEdit, router]);

  function addFiles(fileList: FileList | File[] | null) {
    if (!fileList) return;
    const files = Array.isArray(fileList) ? fileList : Array.from(fileList);
    setErr(null);
    setIsDirty(true);
    setAttachments((prev) => {
      const next = [...prev];
      for (const file of files) {
        if (file.size > MAX_FILE_BYTES) {
          setErr("첨부파일은 25MB 이하로만 가능합니다.");
          continue;
        }
        next.push(file);
      }
      return next;
    });
  }

  function removeFile(idx: number) {
    setIsDirty(true);
    setAttachments((prev) => prev.filter((_, i) => i !== idx));
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    const trimmedTitle = title.trim();
    if (!trimmedTitle || isEmptyDoc(body)) {
      setErr("제목과 내용을 입력하세요.");
      return;
    }
    if (!confirm("등록하시겠습니까?")) return;

    setSaving(true);
    try {
      const created = await api<NoticeOut>("/notices", {
        method: "POST",
        body: { title: trimmedTitle, body },
      });

      if (attachments.length) {
        for (const file of attachments) {
          const fd = new FormData();
          fd.append("file", file);
          await apiForm(`/notices/${created.id}/attachments/upload`, fd);
        }
      }

      setIsDirty(false);
      router.replace("/notices");
    } catch (e: any) {
      setErr(e.message ?? "공지사항 등록에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  };

  if (!canEdit) return null;

  return (
    <form onSubmit={handleSubmit} className="space-y-6 animate-fadeIn">
      <PageHeader
        title="공지사항 등록"
        subtitle="새 공지사항을 등록합니다."
        icon={<Megaphone className="h-7 w-7" strokeWidth={2} />}
        actions={
          <div className="flex items-center gap-2">
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
        }
      />

      <Card padding="none" className="overflow-hidden">
        <div className="px-6 py-4 border-b" style={{ borderColor: "var(--border-default)" }}>
          <div className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
            공지 내용
          </div>
        </div>
        <div className="px-6 py-5 space-y-5">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium" style={{ color: "var(--text-secondary)" }}>
                제목
              </label>
              <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>
                {title.length}/255
              </span>
            </div>
            <input
              className="w-full rounded-lg border px-3 py-2 text-base font-semibold focus:outline-none focus:ring-2 transition-all"
              style={{
                borderColor: "var(--border-default)",
                backgroundColor: "var(--bg-card)",
                color: "var(--text-primary)",
              }}
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                setIsDirty(true);
              }}
              placeholder="제목을 입력하세요."
              maxLength={255}
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium" style={{ color: "var(--text-secondary)" }}>
              내용
            </label>
            <RichTextEditor
              value={body}
              onChange={(next) => {
                setBody(next);
                setIsDirty(true);
              }}
              placeholder="공지사항 내용을 입력하세요."
              onError={setErr}
            />
          </div>
        </div>
      </Card>

      <Card padding="lg" className="space-y-4">
        <div className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
          첨부파일
        </div>

        <div className="space-y-2">
          <div className="text-sm" style={{ color: "var(--text-tertiary)" }}>
            파일당 최대 25MB
          </div>
          <input
            id="notice-attachment-input"
            type="file"
            multiple
            className="sr-only"
            ref={fileInputRef}
            onChange={(e) => {
              addFiles(e.currentTarget.files);
              e.currentTarget.value = "";
            }}
          />

          <div
            className="rounded-2xl border-2 border-dashed px-4 py-3 transition"
            style={{
              borderColor: dragActive ? "var(--color-primary-400)" : "var(--border-default)",
              backgroundColor: dragActive ? "var(--bg-selected)" : "var(--bg-card)",
            }}
            onDragOver={(e) => {
              e.preventDefault();
              setDragActive(true);
            }}
            onDragLeave={(e) => {
              e.preventDefault();
              setDragActive(false);
            }}
            onDrop={(e) => {
              e.preventDefault();
              setDragActive(false);
              addFiles(e.dataTransfer.files);
            }}
          >
            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                className="inline-flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-sm cursor-pointer transition-colors"
                style={{
                  borderColor: "var(--border-default)",
                  backgroundColor: "var(--bg-card)",
                  color: "var(--text-secondary)",
                }}
                onClick={() => {
                  const input = fileInputRef.current;
                  if (!input) return;
                  input.value = "";
                  const showPicker = (input as HTMLInputElement & { showPicker?: () => void }).showPicker;
                  if (showPicker) {
                    showPicker.call(input);
                  } else {
                    input.click();
                  }
                }}
              >
                파일 선택
              </button>
              <span className="text-sm" style={{ color: "var(--text-tertiary)" }}>
                드래그/붙여넣기로 추가할 수 있습니다.
              </span>
              {attachments.length > 0 && (
                <button
                  type="button"
                  className="text-sm hover:underline"
                  style={{ color: "var(--text-secondary)" }}
                  onClick={() => setAttachments([])}
                  disabled={saving}
                >
                  모두 제거
                </button>
              )}
            </div>

            <div className="mt-2 space-y-1.5">
              {attachments.length === 0 && (
                <p className="text-sm" style={{ color: "var(--text-tertiary)" }}>
                  첨부파일이 없습니다.
                </p>
              )}
              {attachments.map((file, idx) => (
                <div
                  key={`${file.name}-${idx}`}
                  className="flex items-center justify-between rounded-lg border px-2 py-1"
                  style={{
                    borderColor: "var(--border-default)",
                    backgroundColor: "var(--bg-subtle)",
                  }}
                >
                  <div>
                    <div className="text-xs" style={{ color: "var(--text-primary)" }}>
                      {file.name}
                    </div>
                    <div className="text-sm" style={{ color: "var(--text-secondary)" }}>
                      {formatBytes(file.size)}
                    </div>
                  </div>
                  <button
                    type="button"
                    className="text-sm hover:underline"
                    style={{ color: "var(--color-danger-700)" }}
                    onClick={() => removeFile(idx)}
                    disabled={saving}
                  >
                    제거
                  </button>
                </div>
              ))}
            </div>
          </div>
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
      </Card>
    </form>
  );
}

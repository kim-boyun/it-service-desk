"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useMe } from "@/lib/auth-context";
import { api, apiForm } from "@/lib/api";
import { EMPTY_DOC, isEmptyDoc, TiptapDoc } from "@/lib/tiptap";
import PageHeader from "@/components/PageHeader";
import { useUnsavedChangesWarning } from "@/lib/use-unsaved-changes";

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
    <div className="p-5 space-y-5">
      <PageHeader title="공지사항 등록" />
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
            placeholder="공지사항 내용을 입력하세요."
            onError={setErr}
          />
        </div>

        <div className="space-y-2">
          <div className="text-sm text-slate-600">파일당 최대 25MB</div>
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
            className={`rounded-2xl border-2 border-dashed px-4 py-3 transition ${
              dragActive ? "border-emerald-400 bg-emerald-50" : "border-slate-200 bg-white"
            }`}
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
                className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm bg-white text-slate-700 hover:bg-slate-50 cursor-pointer"
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
              <span className="text-sm text-slate-500">드래그/붙여넣기로 추가할 수 있습니다.</span>
              {attachments.length > 0 && (
                <button
                  type="button"
                  className="text-sm text-slate-600 hover:underline"
                  onClick={() => setAttachments([])}
                  disabled={saving}
                >
                  모두 제거
                </button>
              )}
            </div>
            <div className="mt-2 space-y-1.5">
              {attachments.length === 0 && <p className="text-sm text-slate-500">첨부파일이 없습니다.</p>}
              {attachments.map((file, idx) => (
                <div
                  key={`${file.name}-${idx}`}
                  className="flex items-center justify-between rounded-lg border border-slate-200 px-2 py-1 bg-slate-50"
                >
                  <div>
                    <div className="text-xs text-slate-900">{file.name}</div>
                    <div className="text-sm text-slate-600">{formatBytes(file.size)}</div>
                  </div>
                  <button
                    type="button"
                    className="text-sm text-red-600 hover:underline"
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

"use client";

import { useParams, useRouter } from "next/navigation";
import { useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useMutation } from "@tanstack/react-query";
import { api, apiForm } from "@/lib/api";
import { EMPTY_DOC, isEmptyDoc, TiptapDoc } from "@/lib/tiptap";
import PageHeader from "@/components/PageHeader";
import { useUnsavedChangesWarning } from "@/lib/use-unsaved-changes";

const RichTextEditor = dynamic(() => import("@/components/RichTextEditor"), { ssr: false });

const MAX_FILE_BYTES = 25 * 1024 * 1024;

function formatBytes(bytes: number) {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(k)), sizes.length - 1);
  const value = bytes / Math.pow(k, i);
  return `${value.toFixed(value >= 10 || i === 0 ? 0 : 1)} ${sizes[i]}`;
}

export default function NewTicketCommentPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const ticketId = Number(params.id);

  const [title, setTitle] = useState("");
  const [body, setBody] = useState<TiptapDoc>(EMPTY_DOC);
  const [attachments, setAttachments] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const attachmentInputRef = useRef<HTMLInputElement | null>(null);
  const [notifyEmail, setNotifyEmail] = useState(false);

  useUnsavedChangesWarning(isDirty);

  const createComment = useMutation({
    mutationFn: async () => {
      const created = await api<{ id: number }>(`/tickets/${ticketId}/comments`, {
        method: "POST",
        body: {
          title: title.trim(),
          body,
          notify_email: notifyEmail,
        },
      });

      if (attachments.length) {
        for (const file of attachments) {
          const fd = new FormData();
          fd.append("file", file);
          await apiForm(`/tickets/${ticketId}/attachments/upload?comment_id=${created.id}`, fd);
        }
      }

      return created;
    },
    onSuccess: () => {
      setIsDirty(false);
      setNotifyEmail(false);
      if (typeof window !== "undefined" && window.opener) {
        window.close();
        return;
      }
      router.replace(`/tickets/${ticketId}`);
    },
    onError: (err: any) => {
      setError(err?.message ?? "댓글 등록에 실패했습니다.");
    },
  });

  function addFiles(fileList: FileList | null) {
    if (!fileList) return;
    setError(null);
    setIsDirty(true);
    setAttachments((prev) => {
      const next = [...prev];
      for (const file of Array.from(fileList)) {
        if (file.size > MAX_FILE_BYTES) {
          setError("첨부파일은 25MB 이하로만 가능합니다.");
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

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!title.trim()) {
      setError("제목을 입력하세요.");
      return;
    }
    if (isEmptyDoc(body)) {
      setError("내용을 입력하세요.");
      return;
    }

    createComment.mutate();
  }

  return (
    <div className="p-5 space-y-5">
      <PageHeader title="댓글 등록" />

      <form onSubmit={onSubmit} className="space-y-4">
        <div className="flex items-center gap-2">
          <button
            type="submit"
            className="inline-flex items-center rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-slate-800 disabled:opacity-60"
            disabled={createComment.isPending}
          >
            {createComment.isPending ? "등록 중..." : "등록"}
          </button>
        </div>

        <div className="border border-slate-200/70 rounded-2xl overflow-hidden bg-white shadow-sm">
          <div className="grid grid-cols-12 border-b border-slate-200/70">
            <div className="col-span-3 bg-slate-50 text-sm font-medium text-slate-700 px-3 py-2 border-r border-slate-200/70">
              제목
            </div>
            <div className="col-span-9 px-3 py-2">
              <input
                className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm"
                value={title}
                onChange={(e) => {
                  setIsDirty(true);
                  setTitle(e.target.value);
                }}
                placeholder="댓글 제목을 입력하세요."
                maxLength={200}
                required
              />
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <div className="text-sm text-slate-600">파일당 최대 25MB</div>
          <input
            id="comment-attachment-input"
            type="file"
            multiple
            className="hidden"
            ref={attachmentInputRef}
            onChange={(e) => {
              addFiles(e.target.files);
              e.target.value = "";
            }}
          />
          <div
            className="rounded-2xl border-2 border-dashed border-slate-200 bg-white px-4 py-3"
            onDragOver={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
            onDrop={(e) => {
              e.preventDefault();
              e.stopPropagation();
              addFiles(e.dataTransfer.files);
            }}
          >
            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm bg-white text-slate-700 hover:bg-slate-50"
                onClick={() => attachmentInputRef.current?.click()}
              >
                파일 선택
              </button>
              <span className="text-sm text-slate-500">여기로 드래그 앤 드롭해도 됩니다.</span>
              {attachments.length > 0 && (
                <button
                  type="button"
                  className="text-sm text-slate-600 hover:underline"
                  onClick={() => setAttachments([])}
                  disabled={createComment.isPending}
                >
                  모두 제거
                </button>
              )}
            </div>
            <div className="mt-2 space-y-1.5">
              {attachments.length === 0 && <p className="text-sm text-slate-500">선택된 파일이 없습니다.</p>}
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
                    disabled={createComment.isPending}
                  >
                    제거
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <RichTextEditor
            value={body}
            onChange={(doc) => {
              setIsDirty(true);
              setBody(doc);
            }}
            onError={setError}
            placeholder="댓글 내용을 입력하세요."
          />
        </div>

        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-slate-300"
            checked={notifyEmail}
            onChange={(e) => {
              setIsDirty(true);
              setNotifyEmail(e.target.checked);
            }}
          />
          메일 알림 발송
        </label>

        {error && <div className="text-sm text-red-600">{error}</div>}
      </form>
    </div>
  );
}

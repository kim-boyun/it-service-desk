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

const UNSAVED_MESSAGE = "\uc774 \ud398\uc774\uc9c0\ub97c \ub098\uac00\uc2dc\uaca0\uc2b5\ub2c8\uae4c?\n\ubcc0\uacbd\uc0ac\ud56d\uc774 \uc800\uc7a5\ub418\uc9c0 \uc54a\uc744 \uc218 \uc788\uc2b5\ub2c8\ub2e4.";
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
          setErr("\ucca8\ubd80\ud30c\uc77c\uc740 25MB \uc774\ud558\ub85c\ub9cc \uac00\ub2a5\ud569\ub2c8\ub2e4.");
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
      setErr("\uc81c\ubaa9\uacfc \ub0b4\uc6a9\uc744 \uc785\ub825\ud558\uc138\uc694.");
      return;
    }

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
      setErr(e.message ?? "\uacf5\uc9c0\uc0ac\ud56d \ub4f1\ub85d\uc5d0 \uc2e4\ud328\ud588\uc2b5\ub2c8\ub2e4.");
    } finally {
      setSaving(false);
    }
  };

  if (!canEdit) return null;

  return (
    <div className="p-5 space-y-5">
      <PageHeader title="\uacf5\uc9c0\uc0ac\ud56d \ub4f1\ub85d" />
      <form onSubmit={handleSubmit} className="space-y-5 border border-slate-200/70 rounded-2xl bg-white p-5 shadow-sm">
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <label className="text-sm text-slate-700">\uc81c\ubaa9</label>
            <span className="text-xs text-slate-500">{title.length}/255</span>
          </div>
          <input
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              setIsDirty(true);
            }}
            placeholder="\uc81c\ubaa9\uc744 \uc785\ub825\ud558\uc138\uc694."
            maxLength={255}
          />
        </div>
        <div className="space-y-1">
          <label className="text-sm text-slate-700">\ub0b4\uc6a9</label>
          <RichTextEditor
            value={body}
            onChange={(next) => {
              setBody(next);
              setIsDirty(true);
            }}
            placeholder="\uacf5\uc9c0\uc0ac\ud56d \ub0b4\uc6a9\uc744 \uc785\ub825\ud558\uc138\uc694."
            onError={setErr}
          />
        </div>

        <div className="space-y-2">
          <div className="text-sm text-slate-600">\ud30c\uc77c\ub2f9 \ucd5c\ub300 25MB</div>
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
                \ud30c\uc77c \uc120\ud0dd
              </button>
              <span className="text-sm text-slate-500">\ub4dc\ub798\uadf8/\ubd99\uc5ec\ub123\uae30\ub85c \ucd94\uac00\ud560 \uc218 \uc788\uc2b5\ub2c8\ub2e4.</span>
              {attachments.length > 0 && (
                <button
                  type="button"
                  className="text-sm text-slate-600 hover:underline"
                  onClick={() => setAttachments([])}
                  disabled={saving}
                >
                  \ubaa8\ub450 \uc81c\uac70
                </button>
              )}
            </div>
            <div className="mt-2 space-y-1.5">
              {attachments.length === 0 && <p className="text-sm text-slate-500">\ucca8\ubd80\ud30c\uc77c\uc774 \uc5c6\uc2b5\ub2c8\ub2e4.</p>}
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
                    \uc81c\uac70
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
            \ucde8\uc18c
          </button>
          <button
            type="submit"
            className="px-4 py-2 text-sm rounded-lg bg-slate-900 text-white hover:bg-slate-800 transition"
            disabled={saving}
          >
            \ub4f1\ub85d
          </button>
        </div>
      </form>
    </div>
  );
}

"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import Link from "@tiptap/extension-link";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import { apiForm } from "@/lib/api";
import { TiptapDoc, isEmptyDoc } from "@/lib/tiptap";
import EditorToolbar from "@/components/EditorToolbar";
import LinkModal from "@/components/LinkModal";

type Props = {
  value: TiptapDoc;
  onChange: (doc: TiptapDoc) => void;
  placeholder?: string;
  readOnly?: boolean;
  onError?: (message: string) => void;
  minHeight?: string;
  showToolbar?: boolean;
};

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export default function RichTextEditor({
  value,
  onChange,
  placeholder,
  readOnly = false,
  onError,
  minHeight,
  showToolbar = true,
}: Props) {
  const [uploading, setUploading] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkValue, setLinkValue] = useState("");
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3, 4] },
      }),
      Image.configure({
        inline: true,
        allowBase64: false,
      }),
      Link.configure({
        openOnClick: false,
        autolink: false,
        linkOnPaste: false,
      }),
      TaskList,
      TaskItem.configure({ nested: true }),
    ],
    content: value,
    editable: !readOnly,
    immediatelyRender: false,
    onUpdate: ({ editor }) => {
      onChange(editor.getJSON() as TiptapDoc);
    },
    editorProps: {
      handlePaste: (_, event) => {
        const files = Array.from(event.clipboardData?.files ?? []);
        if (!files.length) return false;
        void uploadImages(files);
        return true;
      },
      handleDrop: (_, event, __, moved) => {
        if (moved) return false;
        const files = Array.from(event.dataTransfer?.files ?? []);
        if (!files.length) return false;
        void uploadImages(files);
        return true;
      },
    },
  });

  const apiBase = useMemo(() => process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000", []);

  async function uploadImages(files: File[]) {
    if (!editor) return;
    setUploading(true);
    for (const file of files) {
      if (!file.type.startsWith("image/")) {
        onError?.("이미지 파일만 업로드할 수 있습니다.");
        continue;
      }
      if (file.size > MAX_IMAGE_BYTES) {
        onError?.("이미지는 5MB 이하로 업로드할 수 있습니다.");
        continue;
      }
      try {
        const fd = new FormData();
        fd.append("file", file);
        const res = await apiForm<{ url: string }>("/uploads/images", fd);
        const src = res.url.startsWith("http") ? res.url : `${apiBase}${res.url}`;
        editor.chain().focus().setImage({ src, alt: file.name }).run();
      } catch (e: any) {
        onError?.(e?.message ?? "이미지 업로드에 실패했습니다.");
      }
    }
    setUploading(false);
  }

  useEffect(() => {
    if (editor && value && JSON.stringify(value) !== JSON.stringify(editor.getJSON())) {
      editor.commands.setContent(value);
    }
  }, [value, editor]);

  if (!editor) return null;

  const handleOpenLink = () => {
    const current = editor.getAttributes("link").href ?? "";
    setLinkValue(current);
    setLinkOpen(true);
  };

  const handleApplyLink = () => {
    if (!linkValue.trim()) {
      editor.chain().focus().unsetLink().run();
      setLinkOpen(false);
      return;
    }
    editor.chain().focus().extendMarkRange("link").setLink({ href: linkValue.trim() }).run();
    setLinkOpen(false);
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
      {!readOnly && showToolbar && (
        <div className="relative">
          <EditorToolbar
            editor={editor}
            onOpenLink={handleOpenLink}
            onRemoveLink={() => editor.chain().focus().unsetLink().run()}
            onPickImage={() => fileInputRef.current?.click()}
          />
          <LinkModal
            open={linkOpen}
            value={linkValue}
            onChange={setLinkValue}
            onClose={() => setLinkOpen(false)}
            onSubmit={handleApplyLink}
          />
        </div>
      )}

      <div className="relative px-4 py-3" style={minHeight ? { minHeight } : undefined}>
        <EditorContent editor={editor} className="tiptap" />
        {placeholder && isEmptyDoc(editor.getJSON() as TiptapDoc) && (
          <div className="pointer-events-none absolute left-4 top-3 text-sm text-gray-400">{placeholder}</div>
        )}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          if (files.length) void uploadImages(files);
          e.target.value = "";
        }}
      />

      {!readOnly && uploading && <div className="px-4 pb-3 text-xs text-gray-500">이미지 업로드 중...</div>}
    </div>
  );
}

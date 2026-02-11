"use client";

import type { ReactNode } from "react";
import type { Editor } from "@tiptap/react";
import type { Level } from "@tiptap/extension-heading";

type Props = {
  editor: Editor;
  onOpenLink: () => void;
  onRemoveLink: () => void;
  onPickImage: () => void;
};

type ButtonProps = {
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
};

function ToolbarButton({ label, active, disabled, onClick, children }: ButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={[
        "inline-flex h-9 w-9 items-center justify-center rounded-md border text-sm transition",
        active ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50",
        disabled ? "cursor-not-allowed opacity-40" : "cursor-pointer",
      ].join(" ")}
    >
      {children}
    </button>
  );
}

function Divider() {
  return <div className="h-6 w-px bg-slate-200" aria-hidden="true" />;
}

function getHeadingValue(editor: Editor) {
  if (editor.isActive("heading", { level: 1 })) return "h1";
  if (editor.isActive("heading", { level: 2 })) return "h2";
  if (editor.isActive("heading", { level: 3 })) return "h3";
  if (editor.isActive("heading", { level: 4 })) return "h4";
  return "paragraph";
}

export default function EditorToolbar({ editor, onOpenLink, onRemoveLink, onPickImage }: Props) {
  const headingValue = getHeadingValue(editor);
  const canUndo = editor.can().undo();
  const canRedo = editor.can().redo();
  const isLinkActive = editor.isActive("link");

  return (
    <div className="mobile-editor-toolbar flex flex-wrap items-center gap-2 rounded-t-lg border-b bg-white px-3 py-2">
      <select
        className="h-9 rounded-md border border-slate-200 bg-white px-2 text-sm text-slate-700"
        value={headingValue}
        onChange={(e) => {
          const value = e.target.value;
          if (value === "paragraph") {
            editor.chain().focus().setParagraph().run();
          } else {
            const level = Number(value.replace("h", ""));
            if ([1, 2, 3, 4].includes(level)) {
              editor.chain().focus().toggleHeading({ level: level as Level }).run();
            }
          }
        }}
      >
        <option value="paragraph">본문</option>
        <option value="h1">H1</option>
        <option value="h2">H2</option>
        <option value="h3">H3</option>
        <option value="h4">H4</option>
      </select>

      <Divider />

      <ToolbarButton label="굵게" active={editor.isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()}>
        <span className="font-bold">B</span>
      </ToolbarButton>
      <ToolbarButton label="기울임" active={editor.isActive("italic")} onClick={() => editor.chain().focus().toggleItalic().run()}>
        <span className="italic">I</span>
      </ToolbarButton>
      <ToolbarButton label="취소선" active={editor.isActive("strike")} onClick={() => editor.chain().focus().toggleStrike().run()}>
        <span className="line-through">S</span>
      </ToolbarButton>
      <ToolbarButton label="인라인 코드" active={editor.isActive("code")} onClick={() => editor.chain().focus().toggleCode().run()}>
        <span className="font-mono text-xs">&lt;/&gt;</span>
      </ToolbarButton>

      <Divider />

      <ToolbarButton
        label="글머리"
        active={editor.isActive("bulletList")}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
      >
        <svg viewBox="0 0 20 20" className="h-4 w-4" fill="currentColor">
          <circle cx="4" cy="5" r="1.5" />
          <circle cx="4" cy="10" r="1.5" />
          <circle cx="4" cy="15" r="1.5" />
          <rect x="7" y="4.25" width="9" height="1.5" rx="0.75" />
          <rect x="7" y="9.25" width="9" height="1.5" rx="0.75" />
          <rect x="7" y="14.25" width="9" height="1.5" rx="0.75" />
        </svg>
      </ToolbarButton>
      <ToolbarButton
        label="번호 목록"
        active={editor.isActive("orderedList")}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
      >
        <svg viewBox="0 0 20 20" className="h-4 w-4" fill="currentColor">
          <text x="2" y="6" fontSize="5">1</text>
          <text x="2" y="11" fontSize="5">2</text>
          <text x="2" y="16" fontSize="5">3</text>
          <rect x="7" y="4.25" width="9" height="1.5" rx="0.75" />
          <rect x="7" y="9.25" width="9" height="1.5" rx="0.75" />
          <rect x="7" y="14.25" width="9" height="1.5" rx="0.75" />
        </svg>
      </ToolbarButton>
      <ToolbarButton
        label="체크리스트"
        active={editor.isActive("taskList")}
        onClick={() => editor.chain().focus().toggleTaskList().run()}
      >
        <svg viewBox="0 0 20 20" className="h-4 w-4" fill="currentColor">
          <rect x="2.5" y="4" width="3" height="3" rx="0.5" />
          <rect x="2.5" y="9" width="3" height="3" rx="0.5" />
          <rect x="2.5" y="14" width="3" height="3" rx="0.5" />
          <rect x="7" y="4.25" width="9" height="1.5" rx="0.75" />
          <rect x="7" y="9.25" width="9" height="1.5" rx="0.75" />
          <rect x="7" y="14.25" width="9" height="1.5" rx="0.75" />
        </svg>
      </ToolbarButton>
      <ToolbarButton
        label="인용문"
        active={editor.isActive("blockquote")}
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
      >
        <svg viewBox="0 0 20 20" className="h-4 w-4" fill="currentColor">
          <path d="M6 6H4a3 3 0 0 0-3 3v3h5V6Z" />
          <path d="M14 6h-2a3 3 0 0 0-3 3v3h5V6Z" />
        </svg>
      </ToolbarButton>

      <Divider />

      <ToolbarButton label="링크 추가" active={isLinkActive} onClick={onOpenLink}>
        <svg viewBox="0 0 20 20" className="h-4 w-4" fill="currentColor">
          <path d="M7.8 12.2a3 3 0 0 1 0-4.2l2-2a3 3 0 1 1 4.2 4.2l-1 1a1 1 0 1 1-1.4-1.4l1-1a1 1 0 1 0-1.4-1.4l-2 2a1 1 0 0 0 1.4 1.4 1 1 0 0 1 1.4 1.4 3 3 0 0 1-4.2 0Z" />
          <path d="M12.2 7.8a3 3 0 0 1 0 4.2l-2 2a3 3 0 1 1-4.2-4.2l1-1a1 1 0 1 1 1.4 1.4l-1 1a1 1 0 0 0 1.4 1.4l2-2a1 1 0 0 0-1.4-1.4 1 1 0 1 1-1.4-1.4 3 3 0 0 1 4.2 0Z" />
        </svg>
      </ToolbarButton>
      <ToolbarButton label="링크 제거" disabled={!isLinkActive} onClick={onRemoveLink}>
        <svg viewBox="0 0 20 20" className="h-4 w-4" fill="currentColor">
          <path d="M4 4l12 12-1.4 1.4L2.6 5.4 4 4Z" />
          <path d="M7.8 12.2a3 3 0 0 1 0-4.2l1-1a1 1 0 0 1 1.4 1.4l-1 1a1 1 0 0 0 1.4 1.4 1 1 0 0 1 1.4 1.4 3 3 0 0 1-4.2 0Z" />
        </svg>
      </ToolbarButton>

      <Divider />

      <ToolbarButton label="이미지 업로드" onClick={onPickImage}>
        <svg viewBox="0 0 20 20" className="h-4 w-4" fill="currentColor">
          <path d="M4 4h12a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Zm0 2v8h12V6H4Z" />
          <circle cx="7" cy="8" r="1.5" />
          <path d="M6 14l3-3 2 2 3-3 2 2v2H6Z" />
        </svg>
      </ToolbarButton>

      <Divider />

      <ToolbarButton label="되돌리기" disabled={!canUndo} onClick={() => editor.chain().focus().undo().run()}>
        <svg viewBox="0 0 20 20" className="h-4 w-4" fill="currentColor">
          <path d="M8.5 6H4.7l2.6-2.6L6 2 1 7l5 5 1.3-1.4L4.7 8h3.8a5 5 0 1 1 0 10H8v2h.5a7 7 0 1 0 0-14Z" />
        </svg>
      </ToolbarButton>
      <ToolbarButton label="다시 실행" disabled={!canRedo} onClick={() => editor.chain().focus().redo().run()}>
        <svg viewBox="0 0 20 20" className="h-4 w-4" fill="currentColor">
          <path d="M11.5 6h3.8L12.7 3.4 14 2l5 5-5 5-1.3-1.4L15.3 8h-3.8a5 5 0 1 0 0 10H12v2h-.5a7 7 0 1 1 0-14Z" />
        </svg>
      </ToolbarButton>
    </div>
  );
}

"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useParams, useRouter } from "next/navigation";
import { useMe } from "@/lib/auth-context";
import { api, apiForm } from "@/lib/api";
import { EMPTY_DOC, isEmptyDoc, TiptapDoc } from "@/lib/tiptap";
import { getToken } from "@/lib/auth";
import PageHeader from "@/components/PageHeader";
import { Card, Badge } from "@/components/ui";
import { Megaphone, ArrowLeft, Edit3, Trash2, Save, X as XIcon } from "lucide-react";

const RichTextEditor = dynamic(() => import("@/components/RichTextEditor"), { ssr: false });
const TiptapViewer = dynamic(() => import("@/components/TiptapViewer"), { ssr: false });

const MAX_FILE_BYTES = 25 * 1024 * 1024;

type Attachment = {
  id: number;
  key: string;
  filename: string;
  content_type: string;
  size: number;
  notice_id: number | null;
  uploaded_emp_no: string;
  created_at?: string | null;
};

type Notice = {
  id: number;
  title: string;
  body: TiptapDoc;
  created_at: string;
  updated_at: string;
  attachments: Attachment[];
};

function formatDate(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleString();
}

function formatBytes(bytes: number) {
  if (bytes == 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(k)), sizes.length - 1);
  const value = bytes / Math.pow(k, i);
  return `${value.toFixed(value >= 10 || i === 0 ? 0 : 1)} ${sizes[i]}`;
}

export default function NoticeDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const me = useMe();
  const noticeId = Number(params.id);

  const [notice, setNotice] = useState<Notice | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<{ title: string; body: TiptapDoc }>({ title: "", body: EMPTY_DOC });
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [downloadingId, setDownloadingId] = useState<number | null>(null);
  const [newAttachments, setNewAttachments] = useState<File[]>([]);
  const [dragActive, setDragActive] = useState(false);
  const [deletingAttachmentId, setDeletingAttachmentId] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const canEdit = useMemo(() => me.role === "admin", [me.role]);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    api<Notice>(`/notices/${noticeId}`)
      .then((data) => {
        if (!alive) return;
        setNotice(data);
        setDraft({ title: data.title, body: data.body });
        setError(null);
      })
      .catch((e: any) => {
        if (!alive) return;
        setError(e.message ?? "공지사항을 불러오지 못했습니다.");
      })
      .finally(() => {
        if (!alive) return;
        setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [noticeId]);

  const handleDelete = async () => {
    if (!notice) return;
    if (!confirm("삭제하시겠습니까?")) return;
    setDeleting(true);
    try {
      await api(`/notices/${notice.id}`, { method: "DELETE" });
      router.push("/notices");
    } catch (e: any) {
      setError(e.message ?? "삭제에 실패했습니다.");
    } finally {
      setDeleting(false);
    }
  };

  function addFiles(fileList: FileList | File[] | null) {
    if (!fileList) return;
    const files = Array.isArray(fileList) ? fileList : Array.from(fileList);
    setError(null);
    setNewAttachments((prev) => {
      const next = [...prev];
      for (const file of files) {
        if (file.size > MAX_FILE_BYTES) {
          setError("첨부파일은 25MB 이하로만 가능합니다.");
          continue;
        }
        next.push(file);
      }
      return next;
    });
  }

  function removeNewFile(idx: number) {
    setNewAttachments((prev) => prev.filter((_, i) => i !== idx));
  }

  const deleteExistingAttachment = async (attachmentId: number) => {
    setDeletingAttachmentId(attachmentId);
    try {
      await api(`/attachments/${attachmentId}`, { method: "DELETE" });
      setNotice((prev) =>
        prev ? { ...prev, attachments: prev.attachments.filter((a) => a.id !== attachmentId) } : prev
      );
    } catch (e: any) {
      setError(e.message ?? "첨부파일 삭제에 실패했습니다.");
    } finally {
      setDeletingAttachmentId(null);
    }
  };

  const handleSave = async () => {
    if (!notice) return;
    if (!draft.title.trim() || isEmptyDoc(draft.body)) {
      setError("제목과 내용을 입력하세요.");
      return;
    }
    if (!confirm("변경을 저장하시겠습니까?")) return;
    setSaving(true);
    try {
      await api<Notice>(`/notices/${notice.id}`,
        {
          method: "PATCH",
          body: { title: draft.title.trim(), body: draft.body },
        }
      );
      if (newAttachments.length) {
        for (const file of newAttachments) {
          const fd = new FormData();
          fd.append("file", file);
          await apiForm(`/notices/${notice.id}/attachments/upload`, fd);
        }
      }
      const refreshed = await api<Notice>(`/notices/${notice.id}`);
      setNotice(refreshed);
      setDraft({ title: refreshed.title, body: refreshed.body });
      setNewAttachments([]);
      setEditing(false);
    } catch (e: any) {
      setError(e.message ?? "수정에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  };

  const downloadAttachment = async (attachmentId: number) => {
    setDownloadingId(attachmentId);
    try {
      const { url, filename: apiFilename } = await api<{ url: string; filename?: string }>(`/attachments/${attachmentId}/download-url`);
      const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";
      const token = getToken();
      const isAbsolute = /^https?:\/\//i.test(url);
      const targetUrl = isAbsolute ? url : `${apiBase}${url}`;

      const res = await fetch(targetUrl, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`Download failed ${res.status}: ${text}`);
      }

      const blob = await res.blob();
      const cd = res.headers.get("content-disposition") ?? "";
      const m = /filename="([^"]+)"/.exec(cd);
      const filename = apiFilename ?? m?.[1] ?? `attachment-${attachmentId}`;

      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objectUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(objectUrl);
    } catch (e: any) {
      setError(e.message ?? "첨부파일 다운로드에 실패했습니다.");
    } finally {
      setDownloadingId(null);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6 animate-fadeIn">
        <Card padding="lg">
          <div className="text-center text-sm" style={{ color: "var(--text-secondary)" }}>
            공지사항을 불러오는 중입니다...
          </div>
        </Card>
      </div>
    );
  }

  if (!notice) {
    return (
      <div className="space-y-6 animate-fadeIn">
        <Card padding="lg">
          <div className="space-y-2">
            <div className="text-sm" style={{ color: "var(--text-secondary)" }}>
              공지사항을 찾을 수 없습니다.
            </div>
            <button
              className="inline-flex items-center gap-2 text-sm font-medium"
              style={{ color: "var(--color-primary-700)" }}
              onClick={() => router.push("/notices")}
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
        title={editing ? "공지사항 수정" : notice.title}
        subtitle={editing ? "내용과 첨부파일을 수정할 수 있습니다." : "공지 상세 내용을 확인하세요."}
        icon={<Megaphone className="h-7 w-7" strokeWidth={2} />}
        meta={
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="neutral" size="sm">
              NOTICE #{notice.id}
            </Badge>
            <span className="text-sm" style={{ color: "var(--text-tertiary)" }}>
              생성일 {formatDate(notice.created_at)}
            </span>
          </div>
        }
        actions={
          <div className="flex items-center gap-2">
            <button
              className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors"
              style={{
                borderColor: "var(--border-default)",
                backgroundColor: "var(--bg-card)",
                color: "var(--text-secondary)",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "var(--bg-hover)")}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "var(--bg-card)")}
              onClick={() => router.push("/notices")}
              disabled={saving || deleting}
            >
              <ArrowLeft className="h-4 w-4" />
              목록
            </button>

            {canEdit && (
              <>
                {editing ? (
                  <>
                    <button
                      className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors"
                      style={{
                        borderColor: "var(--border-default)",
                        backgroundColor: "var(--bg-card)",
                        color: "var(--text-secondary)",
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "var(--bg-hover)")}
                      onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "var(--bg-card)")}
                      onClick={() => {
                        setDraft({ title: notice.title, body: notice.body });
                        setNewAttachments([]);
                        setEditing(false);
                      }}
                      disabled={saving}
                    >
                      <XIcon className="h-4 w-4" />
                      취소
                    </button>
                    <button
                      className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold shadow-sm transition-all"
                      style={{
                        background: "linear-gradient(135deg, var(--color-primary-600) 0%, var(--color-primary-700) 100%)",
                        color: "white",
                      }}
                      onClick={handleSave}
                      disabled={saving}
                    >
                      <Save className="h-4 w-4" />
                      저장
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors"
                      style={{
                        borderColor: "var(--border-default)",
                        backgroundColor: "var(--bg-card)",
                        color: "var(--text-secondary)",
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "var(--bg-hover)")}
                      onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "var(--bg-card)")}
                      onClick={() => {
                        setEditing(true);
                        setNewAttachments([]);
                      }}
                    >
                      <Edit3 className="h-4 w-4" />
                      수정
                    </button>
                    <button
                      className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold transition-all"
                      style={{
                        borderColor: "var(--color-danger-300)",
                        backgroundColor: "var(--color-danger-50)",
                        color: "var(--color-danger-700)",
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "var(--color-danger-100)")}
                      onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "var(--color-danger-50)")}
                      onClick={handleDelete}
                      disabled={deleting}
                    >
                      <Trash2 className="h-4 w-4" />
                      삭제
                    </button>
                  </>
                )}
              </>
            )}
          </div>
        }
      />

      {error && (
        <div
          className="rounded-lg border px-4 py-3 text-sm"
          style={{
            backgroundColor: "var(--color-danger-50)",
            borderColor: "var(--color-danger-200)",
            color: "var(--color-danger-700)",
          }}
        >
          {error}
        </div>
      )}

      <Card padding="none" className="overflow-hidden">
        <div className="px-6 py-4 border-b" style={{ borderColor: "var(--border-default)" }}>
          <div className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
            공지 내용
          </div>
        </div>
        <div className="px-6 py-5">
          {editing ? (
            <>
              <div className="mb-3">
                <div className="text-sm font-medium mb-2" style={{ color: "var(--text-secondary)" }}>
                  제목
                </div>
                <input
                  className="w-full rounded-lg border px-3 py-2 text-base font-semibold focus:outline-none focus:ring-2 transition-all"
                  style={{
                    borderColor: "var(--border-default)",
                    backgroundColor: "var(--bg-card)",
                    color: "var(--text-primary)",
                  }}
                  value={draft.title}
                  onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
                />
              </div>
              <RichTextEditor
                value={draft.body}
                onChange={(doc) => setDraft((d) => ({ ...d, body: doc }))}
                onError={setError}
              />
            </>
          ) : (
            <div className="prose max-w-none" style={{ color: "var(--text-primary)" }}>
              <TiptapViewer value={notice.body} />
            </div>
          )}
        </div>
      </Card>

      {editing ? (
        <Card padding="lg" className="space-y-4">
          <div className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
            첨부파일
          </div>
          <div className="space-y-2">
            <div className="text-sm" style={{ color: "var(--text-tertiary)" }}>
              파일당 최대 25MB
            </div>
            <input
              id="notice-edit-attachment-input"
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
                {newAttachments.length > 0 && (
                  <button
                    type="button"
                    className="text-sm hover:underline"
                    style={{ color: "var(--text-secondary)" }}
                    onClick={() => setNewAttachments([])}
                    disabled={saving}
                  >
                    모두 제거
                  </button>
                )}
              </div>
              <div className="mt-2 space-y-1.5">
                {newAttachments.length === 0 && (
                  <p className="text-sm" style={{ color: "var(--text-tertiary)" }}>
                    선택된 파일이 없습니다.
                  </p>
                )}
                {newAttachments.map((file, idx) => (
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
                      onClick={() => removeNewFile(idx)}
                      disabled={saving}
                    >
                      제거
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <div className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
              기존 첨부파일
            </div>
            {notice.attachments.length === 0 ? (
              <div className="text-sm" style={{ color: "var(--text-tertiary)" }}>
                첨부파일이 없습니다.
              </div>
            ) : (
              <div className="border rounded-lg overflow-hidden" style={{ borderColor: "var(--border-default)" }}>
                {notice.attachments.map((a) => (
                  <div
                    key={a.id}
                    className="flex items-center justify-between px-3 py-2"
                    style={{ borderTop: "1px solid var(--border-default)" }}
                  >
                    <div className="text-sm" style={{ color: "var(--text-primary)" }}>
                      {a.filename}
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        className="text-sm border rounded px-2 py-1 transition-colors"
                        style={{
                          borderColor: "var(--border-default)",
                          backgroundColor: "var(--bg-card)",
                          color: "var(--text-secondary)",
                        }}
                        onClick={() => downloadAttachment(a.id)}
                        disabled={downloadingId === a.id}
                      >
                        {downloadingId === a.id ? "다운로드 중.." : "다운로드"}
                      </button>
                      <button
                        className="text-sm border rounded px-2 py-1 transition-colors"
                        style={{
                          borderColor: "var(--color-danger-300)",
                          backgroundColor: "var(--color-danger-50)",
                          color: "var(--color-danger-700)",
                        }}
                        onClick={() => deleteExistingAttachment(a.id)}
                        disabled={deletingAttachmentId === a.id || saving}
                      >
                        {deletingAttachmentId === a.id ? "삭제 중.." : "삭제"}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Card>
      ) : (
        <Card padding="lg">
          <div className="text-sm font-semibold mb-3" style={{ color: "var(--text-primary)" }}>
            첨부파일
          </div>
          {notice.attachments.length === 0 ? (
            <div className="text-sm" style={{ color: "var(--text-tertiary)" }}>
              첨부파일이 없습니다.
            </div>
          ) : (
            <div className="border rounded-lg overflow-hidden" style={{ borderColor: "var(--border-default)" }}>
              {notice.attachments.map((a) => (
                <div
                  key={a.id}
                  className="flex items-center justify-between px-3 py-2"
                  style={{ borderTop: "1px solid var(--border-default)" }}
                >
                  <div className="text-sm" style={{ color: "var(--text-primary)" }}>
                    {a.filename}
                  </div>
                  <button
                    className="text-sm border rounded px-2 py-1 transition-colors"
                    style={{
                      borderColor: "var(--border-default)",
                      backgroundColor: "var(--bg-card)",
                      color: "var(--text-secondary)",
                    }}
                    onClick={() => downloadAttachment(a.id)}
                    disabled={downloadingId === a.id}
                  >
                    {downloadingId === a.id ? "다운로드 중.." : "다운로드"}
                  </button>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}
    </div>
  );
}

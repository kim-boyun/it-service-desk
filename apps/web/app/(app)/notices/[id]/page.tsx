"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { useParams, useRouter } from "next/navigation";
import { useMe } from "@/lib/auth-context";
import { api } from "@/lib/api";
import { EMPTY_DOC, isEmptyDoc, TiptapDoc } from "@/lib/tiptap";
import { getToken } from "@/lib/auth";

const RichTextEditor = dynamic(() => import("@/components/RichTextEditor"), { ssr: false });
const TiptapViewer = dynamic(() => import("@/components/TiptapViewer"), { ssr: false });

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
        setError(e.message ?? "\uacf5\uc9c0\uc0ac\ud56d\uc744 \ubd88\ub7ec\uc624\uc9c0 \ubabb\ud588\uc2b5\ub2c8\ub2e4.");
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
    setDeleting(true);
    try {
      await api(`/notices/${notice.id}`, { method: "DELETE" });
      router.push("/notices");
    } catch (e: any) {
      setError(e.message ?? "\uc0ad\uc81c\uc5d0 \uc2e4\ud328\ud588\uc2b5\ub2c8\ub2e4.");
    } finally {
      setDeleting(false);
    }
  };

  const handleSave = async () => {
    if (!notice) return;
    if (!draft.title.trim() || isEmptyDoc(draft.body)) {
      setError("\uc81c\ubaa9\uacfc \ub0b4\uc6a9\uc744 \uc785\ub825\ud558\uc138\uc694.");
      return;
    }
    setSaving(true);
    try {
      const updated = await api<Notice>(`/notices/${notice.id}`,
        {
          method: "PATCH",
          body: { title: draft.title.trim(), body: draft.body },
        }
      );
      setNotice(updated);
      setDraft({ title: updated.title, body: updated.body });
      setEditing(false);
    } catch (e: any) {
      setError(e.message ?? "\uc218\uc815\uc5d0 \uc2e4\ud328\ud588\uc2b5\ub2c8\ub2e4.");
    } finally {
      setSaving(false);
    }
  };

  const downloadAttachment = async (attachmentId: number) => {
    setDownloadingId(attachmentId);
    try {
      const { url } = await api<{ url: string }>(`/attachments/${attachmentId}/download-url`);
      const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";
      const token = getToken();
      const isAbsolute = /^https?:\/\//i.test(url);
      const targetUrl = isAbsolute ? url : `${apiBase}${url}`;

      if (isAbsolute) {
        const a = document.createElement("a");
        a.href = targetUrl;
        a.target = "_blank";
        a.rel = "noreferrer";
        document.body.appendChild(a);
        a.click();
        a.remove();
        return;
      }

      const res = await fetch(targetUrl, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`Download failed ${res.status}: ${text}`);
      }

      const cd = res.headers.get("content-disposition") ?? "";
      const m = /filename="([^"]+)"/.exec(cd);
      const filename = m?.[1] ?? `attachment-${attachmentId}`;

      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objectUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(objectUrl);
    } catch (e: any) {
      setError(e.message ?? "\ucca8\ubd80\ud30c\uc77c \ub2e4\uc6b4\ub85c\ub4dc\uc5d0 \uc2e4\ud328\ud588\uc2b5\ub2c8\ub2e4.");
    } finally {
      setDownloadingId(null);
    }
  };

  if (loading) {
    return <div className="p-6 text-sm text-gray-500">\uacf5\uc9c0\uc0ac\ud56d\uc744 \ubd88\ub7ec\uc624\ub294 \uc911\uc785\ub2c8\ub2e4...</div>;
  }

  if (!notice) {
    return (
      <div className="p-6 space-y-2">
        <div className="text-sm text-gray-500">\uacf5\uc9c0\uc0ac\ud56d\uc744 \ucc3e\uc744 \uc218 \uc5c6\uc2b5\ub2c8\ub2e4.</div>
        <button className="text-sm text-blue-700 underline" onClick={() => router.push("/notices")}>\ubaa9\ub85d\uc73c\ub85c</button>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <div className="text-xs text-gray-500">NOTICE #{notice.id}</div>
          {editing ? (
            <input
              className="w-full border rounded p-2 text-lg font-semibold"
              value={draft.title}
              onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
            />
          ) : (
            <h1 className="text-2xl font-semibold">{notice.title}</h1>
          )}
          <div className="text-xs text-gray-500">\uc0dd\uc131\uc77c {formatDate(notice.created_at)}</div>
        </div>
      </div>

      {error && <div className="text-sm text-red-600">{error}</div>}

      <div className="border rounded-lg bg-white p-4 shadow-sm min-h-[200px]">
        {editing ? (
          <RichTextEditor value={draft.body} onChange={(doc) => setDraft((d) => ({ ...d, body: doc }))} onError={setError} />
        ) : (
          <TiptapViewer value={notice.body} />
        )}
      </div>

      <div className="border rounded-lg bg-white p-4 shadow-sm">
        <div className="text-sm font-semibold mb-3">\ucca8\ubd80\ud30c\uc77c</div>
        {notice.attachments.length === 0 ? (
          <div className="text-sm text-gray-500">\ucca8\ubd80\ud30c\uc77c\uc774 \uc5c6\uc2b5\ub2c8\ub2e4.</div>
        ) : (
          <div className="border rounded divide-y">
            {notice.attachments.map((a) => (
              <div key={a.id} className="flex items-center justify-between px-3 py-2">
                <div className="text-sm">{a.filename}</div>
                <button
                  className="text-sm border rounded px-2 py-1 transition-colors hover:bg-slate-50 active:bg-slate-100"
                  onClick={() => downloadAttachment(a.id)}
                  disabled={downloadingId === a.id}
                >
                  {downloadingId === a.id ? "\ub2e4\uc6b4\ub85c\ub4dc \uc911..." : "\ub2e4\uc6b4\ub85c\ub4dc"}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex items-center justify-end gap-2">
        <button className="px-4 py-2 text-sm rounded border bg-white text-gray-800 hover:bg-gray-100" onClick={() => router.push("/notices")}>\ubaa9\ub85d</button>
        {canEdit && (
          <>
            {editing ? (
              <>
                <button
                  className="px-4 py-2 text-sm rounded border bg-white text-gray-800 hover:bg-gray-100"
                  onClick={() => {
                    setDraft({ title: notice.title, body: notice.body });
                    setEditing(false);
                  }}
                  disabled={saving}
                >
                  \ucde8\uc18c
                </button>
                <button
                  className="px-4 py-2 text-sm rounded border bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-60"
                  onClick={handleSave}
                  disabled={saving}
                >
                  \uc800\uc7a5
                </button>
              </>
            ) : (
              <>
                <button className="px-4 py-2 text-sm rounded border bg-white text-gray-800 hover:bg-gray-100" onClick={() => setEditing(true)}>
                  \uc218\uc815
                </button>
                <button
                  className="px-4 py-2 text-sm rounded border bg-red-600 text-white hover:bg-red-700 disabled:opacity-60"
                  onClick={handleDelete}
                  disabled={deleting}
                >
                  \uc0ad\uc81c
                </button>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

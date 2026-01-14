"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useMe } from "@/lib/auth-context";
import { useUnsavedChangesWarning } from "@/lib/use-unsaved-changes";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { TiptapDoc } from "@/lib/tiptap";
import ErrorDialog from "@/components/ErrorDialog";

type Ticket = {
  id: number;
  title: string;
  status: string;
  priority?: string;
  category?: string;
  assignee?: UserSummary | null;
  assignee_id?: number | null;
  created_at?: string;
  updated_at?: string | null;
};

const STATUS_SORT: Record<string, number> = {
  waiting: 0,
  doing: 1,
  done: 2,
  review: 3,
};

const PRIORITY_SORT: Record<string, number> = {
  urgent: 0,
  high: 1,
  medium: 2,
  low: 3,
};

type UserSummary = {
  id: number;
  employee_no?: string | null;
  name?: string | null;
  title?: string | null;
  department?: string | null;
};

type Notice = {
  id: number;
  title: string;
  body: TiptapDoc;
  created_at: string;
  updated_at: string;
};

type Faq = {
  id: number;
  question: string;
  answer: TiptapDoc;
  category_id: number | null;
  category_name: string | null;
  created_at: string;
  updated_at: string;
};

type ContactPerson = {
  name: string;
  title: string;
  dept: string;
  email: string;
  phone: string;
};

type ContactGroup = {
  category: string;
  person: ContactPerson;
};

function HomeCard({
  title,
  children,
  right,
  className = "",
}: {
  title: React.ReactNode;
  children: React.ReactNode;
  right?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={"rounded-xl border border-neutral-200 bg-white shadow-sm " + className}>
      <div className="px-5 py-4 flex items-center justify-between border-b border-neutral-100">
        <h2 className="text-base font-semibold text-neutral-900">{title}</h2>
        {right}
      </div>
      <div className="px-5 py-4">{children}</div>
    </div>
  );
}

function StatCard({
  label,
  value,
  variant = "default",
  loading,
}: {
  label: string;
  value: number;
  variant?: "default" | "primary" | "success" | "warning";
  loading?: boolean;
}) {
  const variantStyles = {
    default: "bg-white border-neutral-200",
    primary: "bg-primary-50 border-primary-200",
    success: "bg-success-50 border-success-200",
    warning: "bg-warning-50 border-warning-200",
  };

  const textStyles = {
    default: "text-neutral-900",
    primary: "text-primary-700",
    success: "text-success-700",
    warning: "text-warning-700",
  };

  return (
    <div className={`rounded-xl border shadow-sm px-5 py-4 ${variantStyles[variant]}`}>
      <div className="text-sm font-medium text-neutral-600 mb-1">{label}</div>
      <div className={`text-3xl font-bold ${textStyles[variant]}`}>{loading ? "..." : value}</div>
    </div>
  );
}

function classifyStatus(status: string) {
  const s = (status || "").toLowerCase();
  const waiting = new Set(["open", "new", "pending", "todo", "requested"]);
  const doing = new Set(["in_progress", "progress", "working", "assigned", "doing", "processing"]);
  const done = new Set(["resolved", "done", "completed"]);
  const review = new Set(["closed", "review", "business_review"]);

  if (waiting.has(s)) return "waiting";
  if (doing.has(s)) return "doing";
  if (done.has(s)) return "done";
  if (review.has(s)) return "review";
  return "waiting";
}

function priorityRank(priority?: string) {
  return PRIORITY_SORT[(priority || "medium").toLowerCase()] ?? 9;
}

function statusBadge(status: string) {
  const cls = classifyStatus(status);
  if (cls === "waiting") return { label: "대기", className: "bg-info-50 text-info-700 border-info-200" };
  if (cls === "doing") return { label: "진행", className: "bg-warning-50 text-warning-700 border-warning-200" };
  if (cls === "review") return { label: "사업검토", className: "bg-neutral-100 text-neutral-700 border-neutral-200" };
  return { label: "완료", className: "bg-success-50 text-success-700 border-success-200" };
}

function formatUser(user?: UserSummary | null, fallbackId?: number | null, emptyLabel = "-") {
  if (!user) return fallbackId ? `#${fallbackId}` : emptyLabel;
  const parts = [user.name, user.title, user.department].filter(Boolean);
  if (parts.length) return parts.join(" / ");
  return user.employee_no ?? (fallbackId ? `#${fallbackId}` : emptyLabel);
}

function formatDate(v?: string | null) {
  if (!v) return "-";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? "-" : d.toLocaleString();
}

const DEFAULT_CONTACT_GROUPS: ContactGroup[] = [
  {
    category: "Dooray(두레이/그룹웨어)",
    person: { name: "김준호", title: "전문원", dept: "전산2팀", email: "junho_kim@kdischool.ac.kr", phone: "044-550-1123" },
  },
  {
    category: "VDI(Gabia DaaS)",
    person: { name: "김준호", title: "전문원", dept: "전산2팀", email: "junho_kim@kdischool.ac.kr", phone: "044-550-1123" },
  },
  {
    category: "포탈",
    person: { name: "현민성", title: "책임전문원", dept: "전산2팀/팀장", email: "ms_hyun@kdischool.ac.kr", phone: "044-550-1116" },
  },
  {
    category: "MIS(학사)",
    person: { name: "김준호", title: "전문원", dept: "전산2팀", email: "junho_kim@kdischool.ac.kr", phone: "044-550-1123" },
  },
  {
    category: "MIS(일반행정)",
    person: { name: "김현아", title: "책임전문원", dept: "전산2팀", email: "hakim@kdischool.ac.kr", phone: "044-550-1059" },
  },
  {
    category: "클라우드",
    person: { name: "김준호", title: "전문원", dept: "전산2팀", email: "junho_kim@kdischool.ac.kr", phone: "044-550-1123" },
  },
  {
    category: "정보보안",
    person: { name: "임을영", title: "선임전문원", dept: "전산2팀", email: "ey_lim@kdischool.ac.kr", phone: "044-550-1052" },
  },
  {
    category: "네트워크/서버",
    person: { name: "임을영", title: "선임전문원", dept: "전산2팀", email: "ey_lim@kdischool.ac.kr", phone: "044-550-1052" },
  },
  {
    category: "컴퓨터/노트북 관리",
    person: { name: "송창용", title: "책임전문원", dept: "전산2팀", email: "cysong@kdischool.ac.kr", phone: "044-550-1275" },
  },
  {
    category: "IT서비스",
    person: { name: "송창용", title: "책임전문원", dept: "전산2팀", email: "cysong@kdischool.ac.kr", phone: "044-550-1275" },
  },
];

const UNSAVED_MESSAGE = "이 페이지를 떠나시겠습니까?\n변경사항이 저장되지 않을 수 있습니다.";

function cloneContactGroups(groups: ContactGroup[]) {
  return groups.map((group) => ({
    ...group,
    person: { ...group.person },
  }));
}

export default function HomePage() {
  const me = useMe();
  const limit = 100;
  const [contactGroups, setContactGroups] = useState<ContactGroup[]>(() => cloneContactGroups(DEFAULT_CONTACT_GROUPS));
  const [contactDraft, setContactDraft] = useState<ContactGroup[]>(() => cloneContactGroups(DEFAULT_CONTACT_GROUPS));
  const [contactEditOpen, setContactEditOpen] = useState(false);
  const [contactDirty, setContactDirty] = useState(false);

  const canManageContacts = me.role === "admin";

  useUnsavedChangesWarning(contactDirty);

  function openContactEditor() {
    if (!canManageContacts) return;
    setContactDraft(cloneContactGroups(contactGroups));
    setContactDirty(false);
    setContactEditOpen(true);
  }

  function closeContactEditor() {
    setContactEditOpen(false);
    setContactDirty(false);
    setContactDraft(cloneContactGroups(contactGroups));
  }

  function attemptCloseEditor() {
    if (contactDirty && !confirm(UNSAVED_MESSAGE)) return;
    closeContactEditor();
  }

  function saveContactEditor() {
    setContactGroups(cloneContactGroups(contactDraft));
    closeContactEditor();
  }

  const [notices, setNotices] = useState<Notice[]>([]);
  const [faqs, setFaqs] = useState<Faq[]>([]);
  const [infoError, setInfoError] = useState<string | null>(null);
  const [pageError, setPageError] = useState<string | null>(null);

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ["homeTickets", limit],
    queryFn: async () => {
      return await api<Ticket[]>(`/tickets?limit=${limit}&offset=0`, { method: "GET" });
    },
    staleTime: 10_000,
  });

  const { waitingCount, doingCount, doneCount, reviewCount, recent } = useMemo(() => {
    const tickets = Array.isArray(data) ? data : [];

    let waiting = 0;
    let doing = 0;
    let done = 0;
    let review = 0;

    for (const t of tickets) {
      const cls = classifyStatus(t.status);
      if (cls === "waiting") waiting++;
      else if (cls === "doing") doing++;
      else if (cls === "review") review++;
      else done++;
    }

    const recentTickets = [...tickets]
      .sort((a, b) => {
        const sa = STATUS_SORT[classifyStatus(a.status)] ?? 9;
        const sb = STATUS_SORT[classifyStatus(b.status)] ?? 9;
        if (sa !== sb) return sa - sb;

        const pa = priorityRank(a.priority);
        const pb = priorityRank(b.priority);
        if (pa !== pb) return pa - pb;

        const at = a.updated_at ? Date.parse(a.updated_at) : a.created_at ? Date.parse(a.created_at) : 0;
        const bt = b.updated_at ? Date.parse(b.updated_at) : b.created_at ? Date.parse(b.created_at) : 0;
        if (bt !== at) return bt - at;

        return (b.id ?? 0) - (a.id ?? 0);
      })
      .slice(0, 5);

    return {
      waitingCount: waiting,
      doingCount: doing,
      doneCount: done,
      reviewCount: review,
      recent: recentTickets,
    };
  }, [data]);

  useEffect(() => {
    if (!isError) return;
    setPageError((error as any)?.message ?? "요청 정보를 불러오지 못했습니다.");
  }, [isError, error]);

  useEffect(() => {
    let alive = true;
    Promise.all([api<Notice[]>("/notices"), api<Faq[]>("/faqs")])
      .then(([noticeData, faqData]) => {
        if (!alive) return;
        setNotices(noticeData);
        setFaqs(faqData);
        setInfoError(null);
      })
      .catch((e: any) => {
        if (!alive) return;
        setInfoError(e.message ?? "공지/FAQ를 불러오지 못했습니다.");
      });
    return () => {
      alive = false;
    };
  }, []);

  const topNotices = useMemo(
    () =>
      [...notices]
        .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))
        .slice(0, 5),
    [notices]
  );
  const topFaqs = useMemo(
    () =>
      [...faqs]
        .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))
        .slice(0, 5),
    [faqs]
  );

  return (
    <>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900">대시보드</h1>
          <p className="mt-1 text-sm text-neutral-600">IT 서비스 요청 현황을 한눈에 확인하세요</p>
        </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="대기 중인 요청" value={waitingCount} variant="primary" loading={isLoading || isFetching} />
        <StatCard label="진행 중인 요청" value={doingCount} variant="warning" loading={isLoading || isFetching} />
        <StatCard label="완료된 요청" value={doneCount} variant="default" loading={isLoading || isFetching} />
        <StatCard label="사업 검토" value={reviewCount} variant="default" loading={isLoading || isFetching} />
      </div>

      <ErrorDialog
        message={pageError ?? infoError}
        onClose={() => {
          setPageError(null);
          setInfoError(null);
        }}
      />

      <HomeCard
        title="나의 요청"
        right={
          <button 
            className="text-sm text-neutral-600 hover:text-neutral-900 transition-colors font-medium" 
            onClick={() => refetch()} 
            title="새로고침"
          >
            {isFetching ? "갱신 중..." : "새로고침"}
          </button>
        }
      >
        <div className="overflow-hidden rounded-lg border border-neutral-200">
          <table className="w-full text-sm">
            <thead className="bg-neutral-50">
              <tr className="border-b border-neutral-200">
                <th className="text-left px-4 py-3 font-semibold text-neutral-700">제목</th>
                <th className="text-center px-4 py-3 font-semibold text-neutral-700 w-28">상태</th>
                <th className="text-center px-4 py-3 font-semibold text-neutral-700 w-40">담당자</th>
                <th className="text-center px-4 py-3 font-semibold text-neutral-700 w-44">업데이트</th>
              </tr>
            </thead>
            <tbody>
              {(recent ?? []).length === 0 ? (
                <tr>
                  <td className="px-4 py-8 text-center text-neutral-500" colSpan={4}>
                    최근 요청이 없습니다.
                  </td>
                </tr>
              ) : (
                recent.map((t) => {
                  const b = statusBadge(t.status);
                  return (
                    <tr key={t.id} className="border-b border-neutral-100 last:border-b-0 hover:bg-neutral-50 transition-colors">
                      <td className="px-4 py-3.5">
                        <Link className="text-neutral-900 hover:text-primary-600 hover:underline font-medium transition-colors" href={`/tickets/${t.id}`}>
                          {t.title}
                        </Link>
                      </td>
                      <td className="px-4 py-3.5 text-center">
                        <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium ${b.className}`}>
                          {b.label}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 text-center text-neutral-700">
                        {formatUser(t.assignee, t.assignee_id, "미배정")}
                      </td>
                      <td className="px-4 py-3.5 text-center text-neutral-600">
                        {formatDate(t.updated_at || t.created_at)}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-4 text-right">
          <Link href="/tickets" className="text-sm text-primary-600 hover:text-primary-700 font-medium hover:underline transition-colors">
            모든 요청 보기 →
          </Link>
        </div>
      </HomeCard>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <HomeCard
          title="공지사항"
          right={
            <Link href="/notices" className="text-sm text-primary-600 hover:text-primary-700 font-medium hover:underline transition-colors">
              전체보기 →
            </Link>
          }
        >
          <ul className="space-y-3">
            {topNotices.length === 0 ? (
              <li className="text-neutral-500 text-sm py-4 text-center">등록된 공지사항이 없습니다.</li>
            ) : (
              topNotices.map((n) => (
                <li key={n.id} className="flex items-start justify-between gap-4 pb-3 border-b border-neutral-100 last:border-b-0 last:pb-0">
                  <Link className="text-sm text-neutral-900 hover:text-primary-600 hover:underline truncate transition-colors" href={`/notices/${n.id}`}>
                    {n.title}
                  </Link>
                  <span className="text-xs text-neutral-500 whitespace-nowrap">{formatDate(n.created_at)}</span>
                </li>
              ))
            )}
          </ul>
        </HomeCard>

        <HomeCard
          title="FAQ"
          right={
            <Link href="/faq" className="text-sm text-primary-600 hover:text-primary-700 font-medium hover:underline transition-colors">
              전체보기 →
            </Link>
          }
        >
          <ul className="space-y-3">
            {topFaqs.length === 0 ? (
              <li className="text-neutral-500 text-sm py-4 text-center">등록된 FAQ가 없습니다.</li>
            ) : (
              topFaqs.map((f) => (
                <li key={f.id} className="flex items-start justify-between gap-4 pb-3 border-b border-neutral-100 last:border-b-0 last:pb-0">
                  <Link className="text-sm text-neutral-900 hover:text-primary-600 hover:underline truncate transition-colors" href={`/faq`}>
                    {f.question}
                  </Link>
                  <span className="text-xs text-neutral-500 whitespace-nowrap">{formatDate(f.created_at)}</span>
                </li>
              ))
            )}
          </ul>
        </HomeCard>
      </div>

      <HomeCard
        title={
          <div className="flex items-center gap-2">
            <span>IT 담당자</span>
            {canManageContacts ? (
              <button
                type="button"
                className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-neutral-200 bg-white text-neutral-600 hover:bg-neutral-50 hover:text-neutral-900 transition-colors"
                onClick={openContactEditor}
                aria-label="고객담당자 수정"
              >
                <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35.641-.155 1.157-.652 1.065-2.573-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.573-1.065z"
                  />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </button>
            ) : null}
          </div>
        }
      >
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {contactGroups.map((group) => (
            <div key={group.category} className="rounded-lg border border-neutral-200 bg-neutral-50/50 p-4">
              <div className="text-xs font-semibold text-neutral-600 uppercase tracking-wide mb-3">{group.category}</div>

              <div className="space-y-2">
                <div className="text-sm font-semibold text-neutral-900">
                  {group.person.name} {group.person.title}
                </div>
                <div className="text-xs text-neutral-600">{group.person.dept}</div>
                <div className="pt-2 border-t border-neutral-200 space-y-1">
                  <div className="text-xs text-neutral-600">{group.person.email}</div>
                  <div className="text-xs text-neutral-600">{group.person.phone}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </HomeCard>
      </div>

      {contactEditOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={attemptCloseEditor}
        >
          <div
            className="w-full max-w-4xl rounded-xl bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="border-b border-neutral-200 px-6 py-4">
              <h3 className="text-lg font-semibold text-neutral-900">IT 담당자 수정</h3>
              <p className="text-sm text-neutral-600 mt-1">카테고리별 담당자를 편집할 수 있습니다.</p>
            </div>
            <div className="max-h-[70vh] overflow-y-auto px-6 py-5 space-y-4">
              {contactDraft.map((group, index) => (
                <div key={`${group.category}-${index}`} className="rounded-lg border border-neutral-200 bg-neutral-50/30 p-4 space-y-3">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-neutral-700 mb-1.5">카테고리</label>
                      <input
                        className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                        value={group.category}
                        onChange={(e) => {
                          const value = e.target.value;
                          setContactDraft((prev) =>
                            prev.map((item, i) => (i === index ? { ...item, category: value } : item))
                          );
                          setContactDirty(true);
                        }}
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-neutral-700 mb-1.5">이름</label>
                      <input
                        className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                        value={group.person.name}
                        onChange={(e) => {
                          const value = e.target.value;
                          setContactDraft((prev) =>
                            prev.map((item, i) =>
                              i === index ? { ...item, person: { ...item.person, name: value } } : item
                            )
                          );
                          setContactDirty(true);
                        }}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-neutral-700 mb-1.5">직급</label>
                      <input
                        className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                        value={group.person.title}
                        onChange={(e) => {
                          const value = e.target.value;
                          setContactDraft((prev) =>
                            prev.map((item, i) =>
                              i === index ? { ...item, person: { ...item.person, title: value } } : item
                            )
                          );
                          setContactDirty(true);
                        }}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-neutral-700 mb-1.5">부서/직책</label>
                      <input
                        className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                        value={group.person.dept}
                        onChange={(e) => {
                          const value = e.target.value;
                          setContactDraft((prev) =>
                            prev.map((item, i) =>
                              i === index ? { ...item, person: { ...item.person, dept: value } } : item
                            )
                          );
                          setContactDirty(true);
                        }}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-neutral-700 mb-1.5">이메일</label>
                      <input
                        className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                        value={group.person.email}
                        onChange={(e) => {
                          const value = e.target.value;
                          setContactDraft((prev) =>
                            prev.map((item, i) =>
                              i === index ? { ...item, person: { ...item.person, email: value } } : item
                            )
                          );
                          setContactDirty(true);
                        }}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-neutral-700 mb-1.5">연락처</label>
                      <input
                        className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                        value={group.person.phone}
                        onChange={(e) => {
                          const value = e.target.value;
                          setContactDraft((prev) =>
                            prev.map((item, i) =>
                              i === index ? { ...item, person: { ...item.person, phone: value } } : item
                            )
                          );
                          setContactDirty(true);
                        }}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="border-t border-neutral-200 px-6 py-4 flex items-center justify-end gap-3">
              <button
                type="button"
                className="rounded-lg border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50 transition-colors"
                onClick={attemptCloseEditor}
              >
                취소
              </button>
              <button
                type="button"
                className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 transition-colors shadow-sm"
                onClick={saveContactEditor}
              >
                저장
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

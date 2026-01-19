"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useMe } from "@/lib/auth-context";
import { useTicketCategories } from "@/lib/use-ticket-categories";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { TiptapDoc } from "@/lib/tiptap";
import ErrorDialog from "@/components/ErrorDialog";

type Ticket = {
  id: number;
  title: string;
  status: string;
  priority?: string;
  category_id?: number | null;
  assignee?: UserSummary | null;
  assignee_emp_no?: string | null;
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
  emp_no: string;
  kor_name?: string | null;
  title?: string | null;
  department?: string | null;
  role?: string | null;
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
  emp_no?: string | null;
  kor_name?: string | null;
  title?: string | null;
  department?: string | null;
  email?: string | null;
  phone?: string | null;
};

type ContactGroup = {
  category_id: number;
  people: ContactPerson[];
};

function HomeCard({
  title,
  children,
  right,
  icon,
  className = "",
}: {
  title: React.ReactNode;
  children: React.ReactNode;
  right?: React.ReactNode;
  icon?: string;
  className?: string;
}) {
  return (
    <div
      className={
        "rounded-2xl border border-slate-200 bg-white shadow-[0_1px_0_rgba(15,23,42,0.04)] transition-shadow hover:shadow-[0_8px_24px_rgba(15,23,42,0.08)] " +
        className
      }
    >
      <div className="px-6 py-4 flex items-center justify-between border-b border-slate-100 bg-slate-50/60">
        <div className="flex items-center gap-3">
          {icon && (
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-lg">
              {icon}
            </div>
          )}
          <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
        </div>
        {right}
      </div>
      <div className="px-6 py-5">{children}</div>
    </div>
  );
}

function StatCard({
  label,
  value,
  accentColor,
  bgColor,
  loading,
}: {
  label: string;
  value: number;
  accentColor: string;
  bgColor: string;
  loading?: boolean;
}) {
  return (
    <div
      className="rounded-2xl border border-slate-200 shadow-[0_6px_16px_rgba(15,23,42,0.06)] px-5 py-4"
      style={{ backgroundColor: bgColor }}
    >
      <div className="text-sm font-semibold uppercase tracking-wide" style={{ color: accentColor }}>
        {label}
      </div>
      <div className="mt-2 text-3xl font-bold" style={{ color: accentColor }}>
        {loading ? "..." : value}
      </div>
      <div className="mt-3 h-1.5 w-full rounded-full bg-white/60">
        <div className="h-full rounded-full" style={{ width: "60%", backgroundColor: accentColor }} />
      </div>
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

function formatUser(user?: UserSummary | null, fallbackEmpNo?: string | null, emptyLabel = "-") {
  if (!user) return fallbackEmpNo || emptyLabel;
  const parts = [user.kor_name, user.title, user.department].filter(Boolean);
  if (parts.length) return parts.join(" / ");
  return user.emp_no || fallbackEmpNo || emptyLabel;
}

function formatDate(v?: string | null) {
  if (!v) return "-";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? "-" : d.toLocaleString();
}


export default function HomePage() {
  const me = useMe();
  const limit = 100;
  const { categories } = useTicketCategories();
  const categoryMap = useMemo(() => {
    const entries = categories.map((c) => [c.id, c.name] as const);
    return Object.fromEntries(entries);
  }, [categories]);
  const [contactGroups, setContactGroups] = useState<ContactGroup[]>([]);
  const [contactLoaded, setContactLoaded] = useState(false);

  const { data: contactAssignments = [] } = useQuery({
    queryKey: ["contact-assignments"],
    queryFn: () => api<ContactGroup[]>("/contact-assignments"),
    staleTime: 30_000,
  });

  useEffect(() => {
    if (!categories.length) return;
    if (contactLoaded) return;
    const assignmentMap = new Map<number, ContactPerson[]>();
    for (const item of contactAssignments) {
      assignmentMap.set(item.category_id, item.people);
    }
    const next = categories.map((c) => ({
      category_id: c.id,
      people: assignmentMap.get(c.id) ?? [],
    }));
    setContactGroups(next);
    setContactLoaded(true);
  }, [categories, contactAssignments, contactLoaded]);

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
    <div className="relative">
      <div className="absolute inset-0 -z-10 bg-gradient-to-br from-slate-100 via-slate-50 to-slate-100" />

      <div className="p-4">
        <div className="max-w-[1600px] mx-auto space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-white px-6 py-5 shadow-[0_10px_24px_rgba(15,23,42,0.08)]">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <div className="text-sm font-semibold text-slate-500">KDIS DESK</div>
                <div className="mt-2 text-2xl font-bold text-slate-900">
                  안녕하세요, {me.kor_name || me.emp_no || "사용자"}님
                </div>
                <div className="mt-1 text-sm text-slate-500">접수/처리 현황을 빠르게 확인하세요.</div>
              </div>
              <Link
                href="/tickets/new"
                className="inline-flex items-center justify-center rounded-full bg-slate-900 px-5 py-2 text-sm font-semibold text-white shadow hover:bg-slate-800"
              >
                요청 작성
              </Link>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <StatCard
              label="대기 중인 요청"
              value={waitingCount}
              accentColor="#00c68a"
              bgColor="#00c68a1A"
              loading={isLoading || isFetching}
            />
            <StatCard
              label="진행 중인 요청"
              value={doingCount}
              accentColor="#3ea6f3"
              bgColor="#3ea6f31A"
              loading={isLoading || isFetching}
            />
            <StatCard
              label="완료된 요청"
              value={doneCount}
              accentColor="#f2536e"
              bgColor="#f2536e1A"
              loading={isLoading || isFetching}
            />
            <StatCard
              label="사업검토"
              value={reviewCount}
              accentColor="#fda005"
              bgColor="#fda0051A"
              loading={isLoading || isFetching}
            />
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
              <button className="text-sm text-gray-600 hover:underline" onClick={() => refetch()} title="새로고침">
                {isFetching ? "갱신 중..." : "새로고침"}
              </button>
            }
            className="w-full"
          >
            <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
              <table className="w-full text-base text-center">
                <thead className="bg-gray-50">
                  <tr className="border-b">
                    <th className="text-left p-2 w-[55%]">제목</th>
                    <th className="text-center p-2 w-[15%]">상태</th>
                    <th className="text-center p-2 w-[15%] whitespace-nowrap">담당</th>
                    <th className="text-center p-2 w-[15%] whitespace-nowrap">업데이트</th>
                  </tr>
                </thead>
                <tbody>
                  {(recent ?? []).length === 0 ? (
                    <tr>
                      <td className="p-3 text-gray-500" colSpan={4}>
                        최근 요청이 없습니다.
                      </td>
                    </tr>
                  ) : (
                    recent.map((t) => {
                      const b = statusBadge(t.status);
                      return (
                        <tr key={t.id} className="border-b hover:bg-gray-50">
                          <td className="p-2 text-left">
                            <Link className="hover:underline" href={`/tickets/${t.id}`}>
                              {t.title}
                            </Link>
                          </td>
                          <td className="p-2 text-center">
                            <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-sm font-medium ${b.className}`}>
                              {b.label}
                            </span>
                          </td>
                          <td className="p-2 text-center text-gray-700 whitespace-nowrap">
                            {formatUser(t.assignee, t.assignee_emp_no, "미배정")}
                          </td>
                          <td className="p-2 text-center text-gray-600 whitespace-nowrap">
                            {formatDate(t.updated_at || t.created_at)}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            <div className="mt-2 text-right">
              <Link href="/tickets" className="text-base text-blue-700 hover:underline">
                모든 요청 보기
              </Link>
            </div>
          </HomeCard>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <HomeCard
              title="공지사항"
              right={
                <Link href="/notices" className="text-sm text-gray-600 hover:underline">
                  전체보기
                </Link>
              }
            >
              <ul className="text-base text-gray-700 space-y-2 leading-7">
                {topNotices.length === 0 ? (
                  <li className="text-gray-500 text-sm">등록된 공지사항이 없습니다.</li>
                ) : (
                  topNotices.map((n) => (
                    <li key={n.id} className="flex items-center justify-between gap-2">
                      <Link className="hover:underline truncate" href={`/notices/${n.id}`}>
                        {n.title}
                      </Link>
                      <span className="text-sm text-gray-500">{formatDate(n.created_at)}</span>
                    </li>
                  ))
                )}
              </ul>
            </HomeCard>

            <HomeCard
              title="FAQ"
              right={
                <Link href="/faq" className="text-sm text-gray-600 hover:underline">
                  전체보기
                </Link>
              }
            >
              <ul className="text-base text-gray-700 space-y-2 leading-7">
                {topFaqs.length === 0 ? (
                  <li className="text-gray-500 text-sm">등록된 FAQ가 없습니다.</li>
                ) : (
                  topFaqs.map((f) => (
                    <li key={f.id} className="flex items-center justify-between gap-2">
                      <Link className="hover:underline truncate" href={`/faq`}>
                        {f.question}
                      </Link>
                      <span className="text-sm text-gray-500">{formatDate(f.created_at)}</span>
                    </li>
                  ))
                )}
              </ul>
            </HomeCard>
          </div>

          <HomeCard
            title={
              <div className="flex items-center gap-2">
                <span>고객담당자</span>
                {me.role === "admin" ? (
                  <Link
                    href="/admin/manager"
                    className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                    aria-label="고객담당자 수정"
                  >
                    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35.641-.155 1.157-.652 1.065-2.573-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.573-1.065z"
                      />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                  </Link>
                ) : null}
              </div>
            }
          >
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {contactGroups.map((group) => (
                <div key={group.category_id} className="rounded-xl border border-slate-200 bg-white p-4">
                  <div className="text-sm font-semibold text-slate-700 mb-3">
                    {categoryMap[group.category_id] ?? `카테고리 ${group.category_id}`}
                  </div>

                  <div className="flex flex-col gap-2 rounded-lg border border-slate-200/70 p-3">
                    {group.people.length === 0 ? (
                      <div className="text-sm text-slate-500">등록된 담당자가 없습니다.</div>
                    ) : (
                      group.people.map((person, idx) => (
                        <div
                          key={`${group.category_id}-${person.emp_no ?? idx}`}
                          className="text-sm font-medium text-slate-900"
                        >
                          {person.kor_name || "-"} / {person.title || "-"} / {person.department || "-"}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              ))}
            </div>
          </HomeCard>
        </div>
      </div>

    </div>
  );
}

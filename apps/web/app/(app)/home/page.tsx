"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useMe } from "@/lib/auth-context";
import { useTicketCategories } from "@/lib/use-ticket-categories";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { TiptapDoc } from "@/lib/tiptap";
import ErrorDialog from "@/components/ErrorDialog";
import { StatCard, Card, CardHeader, CardBody, Badge } from "@/components/ui";
import { Ticket, Clock, CheckCircle, AlertCircle, Plus, ArrowRight } from "lucide-react";

type TicketType = {
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
  if (cls === "waiting")
    return { label: "대기", variant: "info" as const };
  if (cls === "doing")
    return { label: "진행", variant: "warning" as const };
  if (cls === "review")
    return { label: "검토", variant: "neutral" as const };
  return { label: "완료", variant: "success" as const };
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
  const { data: contactAssignments = [] } = useQuery({
    queryKey: ["contact-assignments"],
    queryFn: () => api<ContactGroup[]>("/contact-assignments"),
    staleTime: 30_000,
  });

  const contactGroups = useMemo(() => {
    if (!categories.length) return [];
    const assignmentMap = new Map<number, ContactPerson[]>();
    for (const item of contactAssignments) {
      assignmentMap.set(item.category_id, item.people);
    }
    return categories.map((c) => ({
      category_id: c.id,
      people: assignmentMap.get(c.id) ?? [],
    }));
  }, [categories, contactAssignments]);

  const [notices, setNotices] = useState<Notice[]>([]);
  const [faqs, setFaqs] = useState<Faq[]>([]);
  const [infoError, setInfoError] = useState<string | null>(null);
  const [pageError, setPageError] = useState<string | null>(null);

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ["homeTickets", limit],
    queryFn: async () => {
      return await api<TicketType[]>(`/tickets?limit=${limit}&offset=0`, { method: "GET" });
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
    <div className="space-y-6 animate-fadeIn">
      {/* Hero Section */}
      <div
        className="rounded-2xl border p-8"
        style={{
          backgroundColor: "var(--bg-card)",
          borderColor: "var(--border-default)",
          boxShadow: "var(--shadow-md)",
        }}
      >
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="text-sm font-semibold uppercase tracking-wide" style={{ color: "var(--text-tertiary)" }}>
              IT DESK
            </div>
            <div className="mt-2 text-3xl font-bold" style={{ color: "var(--text-primary)" }}>
              안녕하세요, {me.kor_name || me.emp_no || "사용자"}님
            </div>
            <div className="mt-2 text-base" style={{ color: "var(--text-secondary)" }}>
              접수/처리 현황을 빠르게 확인하세요.
            </div>
          </div>
          <div className="flex items-center gap-3">
            {me.role === "admin" && (
              <Link
                href="/admin"
                className="inline-flex items-center justify-center rounded-xl border px-5 py-2.5 text-sm font-semibold transition-all hover:scale-105"
                style={{
                  backgroundColor: "var(--bg-elevated)",
                  borderColor: "var(--border-default)",
                  color: "var(--text-primary)",
                }}
              >
                관리자 메뉴
              </Link>
            )}
            <Link
              href="/tickets/new"
              className="inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold text-white shadow-lg transition-all hover:scale-105 hover:shadow-xl"
              style={{
                background: "linear-gradient(135deg, var(--color-primary-600) 0%, var(--color-primary-700) 100%)",
              }}
            >
              <Plus className="w-4 h-4" />
              요청 작성
            </Link>
          </div>
        </div>
      </div>

      {/* Statistics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="대기 중"
          value={waitingCount}
          icon={<Clock className="w-6 h-6" />}
          variant="info"
          loading={isLoading}
        />
        <StatCard
          title="진행 중"
          value={doingCount}
          icon={<AlertCircle className="w-6 h-6" />}
          variant="warning"
          loading={isLoading}
        />
        <StatCard
          title="완료"
          value={doneCount}
          icon={<CheckCircle className="w-6 h-6" />}
          variant="success"
          loading={isLoading}
        />
        <StatCard
          title="사업 검토"
          value={reviewCount}
          icon={<Ticket className="w-6 h-6" />}
          variant="accent"
          loading={isLoading}
        />
      </div>

      <ErrorDialog
        message={pageError ?? infoError}
        onClose={() => {
          setPageError(null);
          setInfoError(null);
        }}
      />

      {/* Recent Tickets */}
      <Card padding="none">
        <CardHeader>
          <div className="flex items-center justify-between w-full px-6 py-4">
            <h2 className="text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
              최근 처리 현황
            </h2>
            <button
              onClick={() => refetch()}
              className="text-sm font-medium transition-colors"
              style={{ color: "var(--text-secondary)" }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = "var(--text-primary)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = "var(--text-secondary)";
              }}
            >
              {isFetching ? "갱신 중..." : "새로고침"}
            </button>
          </div>
        </CardHeader>
        <CardBody>
          <div className="overflow-hidden">
            <table className="w-full">
              <thead style={{ backgroundColor: "var(--bg-subtle)" }}>
                <tr style={{ borderBottomColor: "var(--border-default)" }} className="border-b">
                  <th
                    className="text-left px-6 py-3 text-sm font-semibold"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    제목
                  </th>
                  <th
                    className="text-center px-6 py-3 text-sm font-semibold w-32"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    상태
                  </th>
                  <th
                    className="text-center px-6 py-3 text-sm font-semibold whitespace-nowrap"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    최근 업데이트
                  </th>
                </tr>
              </thead>
              <tbody>
                {(recent ?? []).length === 0 ? (
                  <tr>
                    <td className="p-8 text-center" colSpan={3} style={{ color: "var(--text-tertiary)" }}>
                      최근 요청이 없습니다.
                    </td>
                  </tr>
                ) : (
                  recent.map((t) => {
                    const b = statusBadge(t.status);
                    return (
                      <tr
                        key={t.id}
                        className="border-b transition-colors"
                        style={{ borderColor: "var(--border-default)" }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.backgroundColor = "var(--bg-hover)";
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.backgroundColor = "transparent";
                        }}
                      >
                        <td className="px-6 py-4">
                          <Link
                            href={`/tickets/${t.id}`}
                            className="font-medium transition-colors"
                            style={{ color: "var(--text-primary)" }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.color = "var(--color-primary-600)";
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.color = "var(--text-primary)";
                            }}
                          >
                            {t.title}
                          </Link>
                        </td>
                        <td className="px-6 py-4 text-center">
                          <Badge variant={b.variant} size="md">
                            {b.label}
                          </Badge>
                        </td>
                        <td
                          className="px-6 py-4 text-center text-sm whitespace-nowrap"
                          style={{ color: "var(--text-secondary)" }}
                        >
                          {formatDate(t.updated_at || t.created_at)}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          <div className="px-6 py-4 border-t" style={{ borderColor: "var(--border-default)" }}>
            <Link
              href="/tickets"
              className="inline-flex items-center gap-2 text-sm font-semibold transition-colors"
              style={{ color: "var(--color-primary-600)" }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = "var(--color-primary-700)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = "var(--color-primary-600)";
              }}
            >
              모든 요청 보기
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </CardBody>
      </Card>

      {/* Info Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card padding="none">
          <CardHeader>
            <div className="flex items-center justify-between w-full px-6 py-4">
              <h2 className="text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
                공지사항
              </h2>
              <Link
                href="/notices"
                className="text-sm font-medium transition-colors"
                style={{ color: "var(--text-secondary)" }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.color = "var(--text-primary)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color = "var(--text-secondary)";
                }}
              >
                더보기
              </Link>
            </div>
          </CardHeader>
          <CardBody padding="md">
            <ul className="space-y-3">
              {topNotices.length === 0 ? (
                <li className="text-sm" style={{ color: "var(--text-tertiary)" }}>
                  등록된 공지사항이 없습니다.
                </li>
              ) : (
                topNotices.map((n) => (
                  <li key={n.id} className="flex items-start justify-between gap-3">
                    <Link
                      href={`/notices/${n.id}`}
                      className="flex-1 text-sm font-medium truncate transition-colors"
                      style={{ color: "var(--text-primary)" }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.color = "var(--color-primary-600)";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.color = "var(--text-primary)";
                      }}
                    >
                      {n.title}
                    </Link>
                    <span className="text-xs whitespace-nowrap" style={{ color: "var(--text-tertiary)" }}>
                      {formatDate(n.created_at)}
                    </span>
                  </li>
                ))
              )}
            </ul>
          </CardBody>
        </Card>

        <Card padding="none">
          <CardHeader>
            <div className="flex items-center justify-between w-full px-6 py-4">
              <h2 className="text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
                FAQ
              </h2>
              <Link
                href="/faq"
                className="text-sm font-medium transition-colors"
                style={{ color: "var(--text-secondary)" }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.color = "var(--text-primary)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color = "var(--text-secondary)";
                }}
              >
                더보기
              </Link>
            </div>
          </CardHeader>
          <CardBody padding="md">
            <ul className="space-y-3">
              {topFaqs.length === 0 ? (
                <li className="text-sm" style={{ color: "var(--text-tertiary)" }}>
                  등록된 FAQ가 없습니다.
                </li>
              ) : (
                topFaqs.map((f) => (
                  <li key={f.id} className="flex items-start justify-between gap-3">
                    <Link
                      href={`/faq`}
                      className="flex-1 text-sm font-medium truncate transition-colors"
                      style={{ color: "var(--text-primary)" }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.color = "var(--color-primary-600)";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.color = "var(--text-primary)";
                      }}
                    >
                      {f.question}
                    </Link>
                    <span className="text-xs whitespace-nowrap" style={{ color: "var(--text-tertiary)" }}>
                      {formatDate(f.created_at)}
                    </span>
                  </li>
                ))
              )}
            </ul>
          </CardBody>
        </Card>
      </div>

      {/* Contact Groups */}
      <Card padding="none">
        <CardHeader>
          <div className="flex items-center justify-between w-full px-6 py-4">
            <div className="flex items-center gap-3">
              <h2 className="text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
                카테고리별 담당자
              </h2>
              {me.role === "admin" && (
                <Link
                  href="/admin/manager"
                  className="flex items-center justify-center w-8 h-8 rounded-lg border transition-all hover:scale-105"
                  style={{
                    backgroundColor: "var(--bg-elevated)",
                    borderColor: "var(--border-default)",
                    color: "var(--text-secondary)",
                  }}
                  aria-label="카테고리별 담당자 수정"
                >
                  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35.641-.155 1.157-.652 1.065-2.573-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.573-1.065z"
                    />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                </Link>
              )}
            </div>
          </div>
        </CardHeader>
        <CardBody padding="md">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {contactGroups.map((group) => (
              <div
                key={group.category_id}
                className="rounded-xl border p-4 transition-all hover:shadow-md"
                style={{
                  backgroundColor: "var(--bg-subtle)",
                  borderColor: "var(--border-default)",
                }}
              >
                <div className="text-sm font-semibold mb-3" style={{ color: "var(--text-primary)" }}>
                  {categoryMap[group.category_id] ?? `카테고리 ${group.category_id}`}
                </div>

                <div
                  className="flex flex-col gap-2 rounded-lg border p-3"
                  style={{
                    backgroundColor: "var(--bg-card)",
                    borderColor: "var(--border-default)",
                  }}
                >
                  {group.people.length === 0 ? (
                    <div className="text-sm" style={{ color: "var(--text-tertiary)" }}>
                      등록된 담당자가 없습니다.
                    </div>
                  ) : (
                    group.people.map((person, idx) => (
                      <div
                        key={`${group.category_id}-${person.emp_no ?? idx}`}
                        className="text-sm font-medium"
                        style={{ color: "var(--text-primary)" }}
                      >
                        {person.kor_name || "-"} / {person.title || "-"} / {person.department || "-"}
                      </div>
                    ))
                  )}
                </div>
              </div>
            ))}
          </div>
        </CardBody>
      </Card>
    </div>
  );
}

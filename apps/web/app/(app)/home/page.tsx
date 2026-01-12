"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
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
  email: string;
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

function Card({
  title,
  children,
  right,
  className = "",
}: {
  title: string;
  children: React.ReactNode;
  right?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={"rounded-2xl border border-white/30 bg-white/80 backdrop-blur shadow-sm " + className}>
      <div className="px-5 pt-4 pb-3 flex items-center justify-between">
        <div className="text-lg font-semibold">{title}</div>
        {right}
      </div>
      <div className="px-5 pb-5">{children}</div>
    </div>
  );
}

function StatPill({
  label,
  value,
  accent,
  loading,
}: {
  label: string;
  value: number;
  accent?: boolean;
  loading?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-white/30 bg-white/85 backdrop-blur shadow-sm px-5 py-4 flex items-center justify-between gap-6">
      <div className={`text-base font-semibold ${accent ? "text-teal-700" : "text-gray-800"}`}>{label}</div>
      <div className={`text-3xl font-bold ${accent ? "text-teal-700" : ""}`}>{loading ? "..." : value}</div>
    </div>
  );
}

function classifyStatus(status: string) {
  const s = (status || "").toLowerCase();
  const waiting = new Set(["open", "new", "pending", "todo", "requested"]);
  const doing = new Set(["in_progress", "progress", "working", "assigned", "doing", "processing"]);
  const done = new Set(["resolved", "done", "completed"]);
  const review = new Set(["closed", "review", "사업검토"]);

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
  if (cls === "waiting") return { label: "대기", className: "bg-teal-100 text-teal-800" };
  if (cls === "doing") return { label: "진행", className: "bg-amber-100 text-amber-800" };
  if (cls === "review") return { label: "사업검토", className: "bg-slate-100 text-slate-800" };
  return { label: "완료", className: "bg-emerald-100 text-emerald-800" };
}

function formatUser(user?: UserSummary | null, fallbackId?: number | null, emptyLabel = "-") {
  if (!user) return fallbackId ? `#${fallbackId}` : emptyLabel;
  const parts = [user.name, user.title, user.department].filter(Boolean);
  if (parts.length) return parts.join(" / ");
  return user.email ?? (fallbackId ? `#${fallbackId}` : emptyLabel);
}

function formatDate(v?: string | null) {
  if (!v) return "-";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? "-" : d.toLocaleString();
}

// ✅ "정/부" 제거: 카테고리당 1명만
const contactGroups: ContactGroup[] = [
  {
    category: "Dooray(메일/메신저)",
    person: { name: "김준호", title: "전문원", dept: "전산2팀", email: "junho_kim@kdischool.ac.kr", phone: "044-550-1123" },
  },
  {
    category: "VDI(GabiaDaaS)",
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
    person: { name: "김현아", title: "전문원", dept: "전산2팀", email: "hakim@kdischool.ac.kr", phone: "044-550-1059" },
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
    category: "PC/프린터",
    person: { name: "송창용", title: "책임전문원", dept: "전산2팀", email: "cysong@kdischool.ac.kr", phone: "044-550-1275" },
  },
];

export default function HomePage() {
  const limit = 100;
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
    setPageError((error as any)?.message ?? "요청을 불러오지 못했습니다.");
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
      <div className="absolute inset-0 -z-10">
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{
            backgroundImage:
              "url('https://images.unsplash.com/photo-1515879218367-8466d910aaa4?auto=format&fit=crop&w=1920&q=80')",
          }}
        />
        <div className="absolute inset-0 bg-black/15" />
        <div className="absolute inset-0 bg-gradient-to-b from-white/10 via-white/10 to-white/40" />
      </div>

      <div className="p-4">
        <div className="max-w-[1600px] mx-auto space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <StatPill label="대기" value={waitingCount} accent loading={isLoading || isFetching} />
            <StatPill label="진행" value={doingCount} loading={isLoading || isFetching} />
            <StatPill label="완료" value={doneCount} loading={isLoading || isFetching} />
            <StatPill label="사업검토" value={reviewCount} loading={isLoading || isFetching} />
          </div>

          <ErrorDialog
            message={pageError ?? infoError}
            onClose={() => {
              setPageError(null);
              setInfoError(null);
            }}
          />

          <Card
            title="나의 요청"
            right={
              <button className="text-sm text-gray-600 hover:underline" onClick={() => refetch()} title="새로고침">
                {isFetching ? "불러오는 중..." : "새로고침"}
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
                        요청이 없습니다.
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
                            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-sm font-medium ${b.className}`}>
                              {b.label}
                            </span>
                          </td>
                          <td className="p-2 text-center text-gray-700 whitespace-nowrap">
                            {formatUser(t.assignee, t.assignee_id, "미배정")}
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
                전체 보기 →
              </Link>
            </div>
          </Card>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <Card
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
            </Card>

            <Card
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
            </Card>
          </div>

          <Card title="고객담당자">
            {/* ✅ 한 줄에 3개(반응형): 모바일 1, md 2, lg 3 */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {contactGroups.map((group) => (
                <div key={group.category} className="rounded-xl border border-slate-200 bg-white p-4">
                  <div className="text-sm font-semibold text-slate-700 mb-3">{group.category}</div>

                  {/* ✅ 정/부 구분 제거: 1명만 표시 */}
                  <div className="flex items-start justify-between gap-4 rounded-lg border border-slate-200/70 p-3">
                    <div className="text-sm font-medium text-slate-900">
                      {group.person.name} / {group.person.title} / {group.person.dept}
                    </div>
                    <div className="text-sm text-slate-600 text-right whitespace-nowrap">
                      <div>{group.person.email}</div>
                      <div>{group.person.phone}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

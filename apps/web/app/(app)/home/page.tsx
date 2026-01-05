"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

type Ticket = {
  id: number;
  title: string;
  status: string;
  priority?: string;
  category?: string;
  assignee_id?: number | null;
  created_at?: string;
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
        <div className="text-sm font-semibold">{title}</div>
        {right}
      </div>
      <div className="px-5 pb-5">{children}</div>
    </div>
  );
}

function StatPill({ label, value, accent, loading }: { label: string; value: number; accent?: boolean; loading?: boolean }) {
  return (
    <div className="rounded-2xl border border-white/30 bg-white/85 backdrop-blur shadow-sm px-5 py-4 flex items-center justify-between gap-6">
      <div className={`text-sm font-semibold ${accent ? "text-teal-700" : "text-gray-800"}`}>{label}</div>
      <div className={`text-xl font-bold ${accent ? "text-teal-700" : ""}`}>{loading ? "…" : value}</div>
    </div>
  );
}

function classifyStatus(status: string) {
  const s = (status || "").toLowerCase();

  const waiting = new Set(["open", "new", "pending", "todo", "requested"]);
  const doing = new Set(["in_progress", "progress", "working", "assigned", "doing", "processing"]);
  const done = new Set(["resolved", "closed", "done", "completed"]);

  if (waiting.has(s)) return "waiting";
  if (doing.has(s)) return "doing";
  if (done.has(s)) return "done";
  return "waiting";
}

function statusBadge(status: string) {
  const cls = classifyStatus(status);
  if (cls === "waiting") return { label: "대기", className: "bg-teal-100 text-teal-800" };
  if (cls === "doing") return { label: "진행", className: "bg-amber-100 text-amber-800" };
  return { label: "완료", className: "bg-emerald-100 text-emerald-800" };
}

export default function HomePage() {
  const limit = 100;

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ["homeTickets", limit],
    queryFn: async () => {
      return await api<Ticket[]>(`/tickets?limit=${limit}&offset=0`, { method: "GET" });
    },
    staleTime: 10_000,
  });

  const { waitingCount, doingCount, doneCount, recent } = useMemo(() => {
    const tickets = Array.isArray(data) ? data : [];

    let waiting = 0;
    let doing = 0;
    let done = 0;

    for (const t of tickets) {
      const cls = classifyStatus(t.status);
      if (cls === "waiting") waiting++;
      else if (cls === "doing") doing++;
      else done++;
    }

    const recentTickets = [...tickets]
      .sort((a, b) => {
        const at = a.created_at ? Date.parse(a.created_at) : 0;
        const bt = b.created_at ? Date.parse(b.created_at) : 0;
        if (bt !== at) return bt - at;
        return (b.id ?? 0) - (a.id ?? 0);
      })
      .slice(0, 5);

    return {
      waitingCount: waiting,
      doingCount: doing,
      doneCount: done,
      recent: recentTickets,
    };
  }, [data]);

  const notices = [
    "최근 블라 브라우저 업데이트로 일부 로그인 이슈가 발생 중입니다.",
    "기숙사/시설 관련 요청은 요일 기준으로 순차 처리됩니다.",
    "첨부파일 업로드 제한: 20MB",
  ];

  const faqs = [
    "VPN 연결이 자주 끊길 때",
    "Outlook 메일 용량 초과 해결 방법",
  ];

  return (
    <div className="relative min-h-[calc(100vh-56px)]">
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

      <div className="p-6">
        <div className="max-w-6xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <StatPill label="대기" value={waitingCount} accent loading={isLoading || isFetching} />
            <StatPill label="진행" value={doingCount} loading={isLoading || isFetching} />
            <StatPill label="완료" value={doneCount} loading={isLoading || isFetching} />
          </div>

          {isError && (
            <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
              티켓을 불러오지 못했습니다.{" "}
              <button className="underline" onClick={() => refetch()}>
                다시 시도
              </button>
              <div className="mt-1 text-xs text-red-700">{(error as any)?.message ?? "Unknown error"}</div>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <Card title="공지사항" right={<span className="text-xs text-gray-500">최근</span>}>
              <ul className="text-sm text-gray-700 space-y-2 leading-6">
                {notices.map((n, i) => (
                  <li key={i}>{n}</li>
                ))}
              </ul>
            </Card>

            <Card
              title="요청 현황"
              right={
                <button className="text-xs text-gray-600 hover:underline" onClick={() => refetch()} title="새로고침">
                  {isFetching ? "불러오는 중..." : "새로고침"}
                </button>
              }
              className="lg:col-span-2"
            >
              <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr className="border-b">
                      <th className="text-left p-2 w-[55%]">제목</th>
                      <th className="text-left p-2 w-[15%]">상태</th>
                      <th className="text-left p-2 w-[15%]">담당</th>
                      <th className="text-left p-2 w-[15%]">ID</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(recent ?? []).length === 0 ? (
                      <tr>
                        <td className="p-3 text-gray-500" colSpan={4}>
                          최신 요청이 없습니다.
                        </td>
                      </tr>
                    ) : (
                      recent.map((t) => {
                        const b = statusBadge(t.status);
                        return (
                          <tr key={t.id} className="border-b hover:bg-gray-50">
                            <td className="p-2">
                              <Link className="hover:underline" href={`/tickets/${t.id}`}>
                                {t.title}
                              </Link>
                            </td>
                            <td className="p-2">
                              <span
                                className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${b.className}`}
                              >
                                {b.label}
                              </span>
                            </td>
                            <td className="p-2 text-gray-700">{t.assignee_id ?? "-"}</td>
                            <td className="p-2 text-gray-600">#{t.id}</td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

              <div className="mt-3 text-right">
                <Link href="/tickets" className="text-sm text-blue-700 hover:underline">
                  전체 보기 →
                </Link>
              </div>
            </Card>

            <Card title="고객 담당자">
              <div className="text-sm text-gray-700 space-y-3">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="font-medium">조영수 · 기사</div>
                    <div className="text-xs text-gray-500">010-8795-9580</div>
                  </div>
                  <div className="text-xs text-blue-700">hccho@cordial.co.kr</div>
                </div>
                <div className="flex items-start justify-between">
                  <div>
                    <div className="font-medium">서영혁 · 부장</div>
                    <div className="text-xs text-gray-500">010-3358-1846</div>
                  </div>
                  <div className="text-xs text-blue-700">syn@cordial.co.kr</div>
                </div>
              </div>
            </Card>

            <Card title="FAQ">
              <ul className="text-sm text-gray-700 space-y-2 leading-6">
                {faqs.map((f, i) => (
                  <li key={i}>{f}</li>
                ))}
              </ul>
            </Card>

            <div className="lg:col-span-2 rounded-2xl border border-white/30 bg-white/80 backdrop-blur shadow-sm p-5 flex items-center justify-between">
              <div>
                <div className="text-sm font-semibold">장애/보안 바로가기</div>
                <div className="text-sm text-gray-600 mt-1">
                  긴급 장애나 보안 이슈는 별도 채널로 신고해 주세요.
                </div>
              </div>
              <button className="rounded-xl bg-blue-600 text-white px-4 py-2 text-sm font-medium hover:bg-blue-700">
                바로가기
              </button>
            </div>

            <div className="lg:col-span-2 rounded-2xl border border-white/30 bg-white/80 backdrop-blur shadow-sm p-5">
              <div className="text-2xl font-semibold text-sky-800">기업자산 모니터링</div>
              <div className="text-sm text-gray-600 mt-2">HOME에서 공지/요청/FAQ/통계를 빠르게 확인할 수 있습니다.</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

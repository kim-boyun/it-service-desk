"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

type Ticket = {
  id: number;
  title: string;
  description: string;
  status: string;
  priority: string;
  category_id: number | null;
  requester_emp_no: string;
  assignee_emp_no: string | null;
  created_at: string;
};

function StatCard({
  label,
  value,
  href,
  accent = false,
}: {
  label: string;
  value: number;
  href: string;
  accent?: boolean;
}) {
  return (
    <Link
      href={href}
      className={`border rounded-xl p-4 hover:shadow-sm transition bg-white ${
        accent ? "border-gray-900" : "border-gray-200"
      }`}
    >
      <div className="text-sm text-gray-600">{label}</div>
      <div className="mt-2 text-2xl font-semibold">{value}</div>
    </Link>
  );
}

function SectionCard({
  title,
  children,
  right,
}: {
  title: string;
  children: React.ReactNode;
  right?: React.ReactNode;
}) {
  return (
    <div className="border rounded-xl bg-white">
      <div className="px-4 py-3 border-b flex items-center justify-between">
        <div className="text-sm font-semibold">{title}</div>
        {right}
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

export default function HomePage() {
  // 최근 요청 목록(필요하면 limit/offset 사용)
  const { data: tickets, isLoading } = useQuery({
    queryKey: ["tickets", "home"],
    queryFn: () => api<Ticket[]>("/tickets?limit=1000&offset=0"),
  });

  const stats = useMemo(() => {
    const arr = tickets ?? [];
    const count = (s: string) => arr.filter((t) => t.status === s).length;

    // 너희 status 값이 open/closed만 있을 수도 있어서 안전하게 처리
    const open = count("open");
    const inProgress = count("in_progress") + count("processing") + count("assigned"); // 혹시 다른 네이밍 대비
    const closed = count("closed") + count("done") + count("resolved");

    // “진행”이 0인데 open만 계속 늘면 보기 안 좋으니, 상태 체계가 open/closed뿐이면 open을 진행으로도 보여줄 수 있음
    return { open, inProgress, closed };
  }, [tickets]);

  const recent = useMemo(() => {
    const arr = tickets ?? [];
    // created_at 내림차순
    return [...arr].sort((a, b) => (a.created_at < b.created_at ? 1 : -1)).slice(0, 8);
  }, [tickets]);

  const notices = [
    "크롬 브라우저 업데이트 후 로그인 문제가 발생할 수 있습니다.",
    "원격지원은 운영시간(09:00~18:00) 내에 지원됩니다.",
    "첨부파일 업로드 용량 제한: 20MB",
  ];

  const faqs = [
    "VPN 연결이 안 될 때 확인할 사항",
    "Outlook 메일 동기화 오류 해결 방법",
  ];

  return (
    <div className="p-6 space-y-4">
      {/* 상단 타이틀 */}
      <div className="flex items-end justify-between gap-4">
        <div>
          <div className="text-xs text-gray-500">CSR</div>
          <h1 className="text-xl font-semibold">HOME</h1>
        </div>

        <Link href="/tickets" className="text-sm border rounded px-3 py-2 hover:bg-gray-50">
          고객요청 바로가기
        </Link>
      </div>

      {/* 상태 카드 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <StatCard label="대기" value={stats.open} href="/tickets?status=open" accent />
        <StatCard label="진행" value={stats.inProgress} href="/tickets?status=in_progress" />
        <StatCard label="완료" value={stats.closed} href="/tickets?status=closed" />
      </div>

      {/* 메인 섹션 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* 공지사항 */}
        <SectionCard
          title="공지사항"
          right={<Link href="/notices" className="text-xs text-gray-600 hover:underline">더보기</Link>}
        >
          <ul className="space-y-2">
            {notices.map((n, i) => (
              <li key={i} className="text-sm text-gray-700">
                • {n}
              </li>
            ))}
          </ul>
        </SectionCard>

        {/* 요청현황(최근 요청) */}
        <div className="lg:col-span-2">
          <SectionCard
            title="요청현황"
            right={<Link href="/tickets" className="text-xs text-gray-600 hover:underline">전체보기</Link>}
          >
            {isLoading ? (
              <div className="text-sm text-gray-500">불러오는 중...</div>
            ) : recent.length === 0 ? (
              <div className="text-sm text-gray-500">표시할 요청이 없습니다.</div>
            ) : (
              <div className="mobile-table-wrap border rounded overflow-hidden overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr className="border-b">
                      <th className="text-left p-2 w-20">번호</th>
                      <th className="text-left p-2">제목</th>
                      <th className="text-center p-2 w-28">상태</th>
                      <th className="text-center p-2 w-44">접수일</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recent.map((t) => (
                      <tr key={t.id} className="border-b hover:bg-gray-50">
                        <td className="p-2">
                          <Link className="underline" href={`/tickets/${t.id}`}>
                            {t.id}
                          </Link>
                        </td>
                        <td className="p-2">
                          <Link className="hover:underline" href={`/tickets/${t.id}`}>
                            {t.title}
                          </Link>
                        </td>
                        <td className="p-2 text-center">{t.status}</td>
                        <td className="p-2 text-center text-gray-600">
                          {new Date(t.created_at).toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </SectionCard>
        </div>

        {/* FAQ */}
        <SectionCard
          title="FAQ"
          right={<Link href="/faq" className="text-xs text-gray-600 hover:underline">더보기</Link>}
        >
          <ul className="space-y-2">
            {faqs.map((f, i) => (
              <li key={i} className="text-sm text-gray-700">
                • {f}
              </li>
            ))}
          </ul>
        </SectionCard>

        {/* 원격지원 배너(선택) */}
        <div className="lg:col-span-2">
          <div className="border rounded-xl bg-white p-4 flex items-center justify-between gap-4">
            <div>
              <div className="text-sm font-semibold">원격지원 바로가기</div>
              <div className="text-sm text-gray-600 mt-1">
                필요 시 담당자가 원격으로 지원합니다.
              </div>
            </div>
            <a
              href="#"
              className="text-sm border rounded px-3 py-2 hover:bg-gray-50"
              onClick={(e) => {
                e.preventDefault();
                alert("나중에 원격지원 링크를 연결하면 됩니다.");
              }}
            >
              바로가기
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

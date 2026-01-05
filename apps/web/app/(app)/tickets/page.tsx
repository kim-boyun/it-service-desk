"use client";

import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

type Ticket = {
  id: number;
  title: string;
  status: string;
  requester_id: number;
  assignee_id?: number | null;
  created_at: string;
  updated_at: string;
};

type TicketListOut =
  | { items: Ticket[]; total: number; limit: number; offset: number }   // 흔한 형태
  | { data: Ticket[]; total: number; limit: number; offset: number };   // 혹시 이런 형태면 대응


type TicketListResponse =
  | { items: Ticket[]; total?: number }
  | { data: Ticket[]; total?: number }
  | Ticket[];

function normalize(res: TicketListResponse): { items: Ticket[]; total?: number } {
  if (Array.isArray(res)) return { items: res };
  if ("items" in res) return { items: res.items, total: res.total };
  if ("data" in res) return { items: res.data, total: res.total };
  return { items: [] };
}

function StatusBadge({ status }: { status: string }) {
  return <span className="inline-flex items-center rounded-full border px-2 py-0.5 text-xs">{status}</span>;
}

export default function TicketsPage() {
  const router = useRouter();

  const limit = 20;
  const offset = 0;

  const { data, isLoading, error } = useQuery({
    queryKey: ["tickets", { limit, offset }],
    queryFn: () => api<TicketListResponse>(`/tickets?limit=${limit}&offset=${offset}`),
    staleTime: 0,
    refetchOnMount: "always",
  });

  if (isLoading) return <div className="p-6">불러오는 중...</div>;
  if (error) return <div className="p-6 text-red-600">에러: {(error as any).message}</div>;

  const norm = normalize(data!);

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold">티켓</h1>
          <p className="text-sm text-gray-500">총 {norm.total ?? norm.items.length}건</p>
        </div>
      </div>

      <div className="border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="text-left p-3 w-24">ID</th>
              <th className="text-left p-3">제목</th>
              <th className="text-left p-3 w-32">상태</th>
              <th className="text-left p-3 w-48">업데이트</th>
            </tr>
          </thead>
          <tbody>
            {norm.items.map((t) => (
              <tr
                key={t.id}
                className="border-t cursor-pointer hover:bg-gray-50"
                onClick={() => router.push(`/tickets/${t.id}`)}
              >
                <td className="p-3">{t.id}</td>
                <td className="p-3">{t.title}</td>
                <td className="p-3">
                  <StatusBadge status={t.status} />
                </td>
                <td className="p-3">{t.updated_at ?? "-"}</td>
              </tr>
            ))}
            {!norm.items.length && (
              <tr className="border-t">
                <td className="p-3 text-gray-500" colSpan={4}>
                  티켓이 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

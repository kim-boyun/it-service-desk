"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { useMe } from "@/lib/auth-context";
import { useTicketCategories } from "@/lib/use-ticket-categories";
import ErrorDialog from "@/components/ErrorDialog";

type Ticket = {
  id: number;
  status: string;
  category_id?: number | null;
  work_type?: string | null;
  created_at?: string;
  updated_at?: string;
};

function KPICard({
  label,
  value,
  subtitle,
  icon,
  trend,
  accent = "#2563eb",
  loading,
}: {
  label: string;
  value: string | number;
  subtitle?: string;
  icon: string;
  trend?: { value: number; label: string };
  accent?: string;
  loading?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm flex h-full flex-col lg:col-span-1">
      <div className="flex items-start justify-between flex-1">
        <div>
          <div className="text-sm font-semibold text-slate-900 mb-1">{label}</div>
          <div className="text-4xl font-bold text-slate-900 mb-2">
            {loading ? <div className="h-10 w-20 bg-slate-200 rounded animate-pulse" /> : value}
          </div>
          {subtitle && <div className="text-xs text-slate-600">{subtitle}</div>}
          {trend && (
            <div className="mt-3 flex items-center gap-2">
              <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-800">
                {trend.value >= 0 ? "↑" : "↓"} {Math.abs(trend.value).toFixed(1)}%
              </span>
              <span className="text-xs text-slate-600">{trend.label}</span>
            </div>
          )}
        </div>
        <div className="flex h-12 w-12 items-center justify-center rounded-xl" style={{ backgroundColor: `${accent}1A` }}>
          <span className="text-2xl" style={{ color: accent }}>
            {icon}
          </span>
        </div>
      </div>
      <div className="mt-auto h-1.5 w-full rounded-full bg-slate-100">
        <div className="h-full rounded-full" style={{ width: "60%", backgroundColor: accent }} />
      </div>
    </div>
  );
}

function ChartCard({
  title,
  subtitle,
  icon,
  action,
  children,
  className = "",
}: {
  title: string;
  subtitle?: string;
  icon?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`rounded-2xl border border-slate-200 bg-white p-6 shadow-sm ${className}`}>
      <div className="mb-6 flex items-start justify-between">
        <div className="flex items-start gap-3">
          {icon && (
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100 text-xl">
              {icon}
            </div>
          )}
          <div>
            <h3 className="text-lg font-bold text-slate-900">{title}</h3>
            {subtitle && <p className="mt-1 text-sm text-slate-600">{subtitle}</p>}
          </div>
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}

function BarChart({
  data,
  maxHeight = 200,
  formatLabel,
}: {
  data: { label: string; value: number }[];
  maxHeight?: number;
  formatLabel?: (label: string) => React.ReactNode;
}) {
  const max = Math.max(1, ...data.map((d) => d.value));

  return (
    <div className="flex items-end justify-between gap-3 mt-20" style={{ height: `${maxHeight}px` }}>
      {data.map((item) => {
        const heightPct = Math.max(8, (item.value / max) * 100);
        return (
          <div key={item.label} className="group flex flex-1 flex-col items-center gap-2">
            <div className="relative flex w-full items-end justify-center" style={{ height: `${maxHeight - 32}px` }}>
              <div
                className="absolute text-xs font-bold text-slate-700 transition-all group-hover:scale-110"
                style={{ bottom: `calc(${heightPct}% + 10px)` }}
              >
                {item.value}
              </div>
              <div
                className="w-full max-w-[36px] mx-auto rounded-t-xl bg-gradient-to-t from-blue-600 to-blue-400 shadow-md transition-all duration-300 group-hover:from-blue-700 group-hover:to-blue-500"
                style={{ height: `${heightPct}%` }}
              />
            </div>
            <div className="w-full text-center text-xs font-medium text-slate-700 leading-tight min-h-[44px] flex items-end justify-center pb-1">
              {formatLabel ? formatLabel(item.label) : item.label}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function AreaChart({
  labels,
  values,
  color = "#006334",
}: {
  labels: string[];
  values: number[];
  color?: string;
}) {
  const width = 1400;
  const height = 240;
  const padding = 24;
  const max = Math.max(1, ...values);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const points = values.map((v, i) => {
    const x = padding + (i / Math.max(1, values.length - 1)) * (width - padding * 2);
    const y = height - padding - (v / max) * (height - padding * 2);
    return { x, y };
  });

  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ");
  const areaPath = `${linePath} L ${width - padding},${height - padding} L ${padding},${height - padding} Z`;

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-64 w-full"
        onMouseMove={(e) => {
          if (points.length === 0) return;
          const rect = e.currentTarget.getBoundingClientRect();
          const x = ((e.clientX - rect.left) / rect.width) * width;
          let nearest = 0;
          let min = Number.POSITIVE_INFINITY;
          for (let i = 0; i < points.length; i += 1) {
            const dist = Math.abs(points[i].x - x);
            if (dist < min) {
              min = dist;
              nearest = i;
            }
          }
          setHoverIdx(nearest);
        }}
        onMouseLeave={() => setHoverIdx(null)}
      >
        <defs>
          <linearGradient id="areaGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.3" />
            <stop offset="100%" stopColor={color} stopOpacity="0.05" />
          </linearGradient>
        </defs>

        {[0, 0.25, 0.5, 0.75, 1].map((ratio) => (
          <line
            key={ratio}
            x1={padding}
            x2={width - padding}
            y1={height - padding - ratio * (height - padding * 2)}
            y2={height - padding - ratio * (height - padding * 2)}
            stroke="#e5e7eb"
            strokeWidth="1"
            strokeDasharray="4 4"
          />
        ))}

        <path d={areaPath} fill="url(#areaGradient)" />
        <path d={linePath} fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />

        {points.map((p, i) => (
          <circle
            key={i}
            cx={p.x}
            cy={p.y}
            r={hoverIdx === i ? 6 : 3}
            fill="white"
            stroke={color}
            strokeWidth="3"
            className="transition-all"
          />
        ))}

        {hoverIdx !== null && (
          <>
            <line
              x1={points[hoverIdx].x}
              y1={padding}
              x2={points[hoverIdx].x}
              y2={height - padding}
              stroke={color}
              strokeWidth="2"
              strokeDasharray="4 4"
              opacity="0.5"
            />
            <circle cx={points[hoverIdx].x} cy={points[hoverIdx].y} r="8" fill={color} opacity="0.2" />
          </>
        )}
      </svg>

      {hoverIdx !== null && points[hoverIdx] ? (
        <div
          className="absolute z-10 -translate-x-1/2 -translate-y-full rounded-lg border border-slate-200 bg-white px-4 py-2 shadow-xl"
          style={{
            left: `${(points[hoverIdx].x / width) * 100}%`,
            top: `${(points[hoverIdx].y / height) * 100}%`,
          }}
        >
          <div className="text-sm font-bold text-slate-900">{values[hoverIdx]}건</div>
          <div className="text-xs text-slate-600">{labels[hoverIdx]}</div>
        </div>
      ) : null}

      <div className="mt-3 flex justify-between px-2 text-xs text-slate-500">
        <span>{labels[0]}</span>
        <span>{labels[Math.floor(labels.length / 2)]}</span>
        <span>{labels[labels.length - 1]}</span>
      </div>
    </div>
  );
}

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

function toKstDate(d: Date) {
  return new Date(d.getTime() + KST_OFFSET_MS);
}

function startOfKstDay(d: Date) {
  const kst = toKstDate(d);
  return new Date(kst.getFullYear(), kst.getMonth(), kst.getDate());
}

function formatWeekKey(d: Date) {
  const copy = new Date(d);
  const day = copy.getDay();
  const diff = (day + 6) % 7;
  copy.setDate(copy.getDate() - diff);
  return `${copy.getFullYear()}-${String(copy.getMonth() + 1).padStart(2, "0")}-${String(copy.getDate()).padStart(2, "0")}`;
}

export default function AdminDashboard() {
  const me = useMe();
  const router = useRouter();
  const { categories, map: categoryMap } = useTicketCategories();
  const [range, setRange] = useState<"daily" | "weekly" | "monthly">("weekly");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (me.role !== "admin") {
    router.replace("/home");
    return null;
  }

  const { data, isLoading, error } = useQuery({
    queryKey: ["admin-dashboard-tickets"],
    queryFn: () => api<Ticket[]>("/tickets?scope=all&limit=300&offset=0"),
    staleTime: 30_000,
    refetchOnWindowFocus: true,
    refetchInterval: 15_000,
  });

  useEffect(() => {
    if (!error) return;
    setErrorMessage((error as any)?.message ?? "관리자 정보를 불러오지 못했습니다.");
  }, [error]);

  const stats = useMemo(() => {
    const now = new Date();
    const today = startOfKstDay(now);
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    let todayNew = 0;
    let yesterdayNew = 0;
    let todayDone = 0;
    let yesterdayDone = 0;
    let totalPending = 0;
    let totalTickets = (data ?? []).length;

    const byCategory: Record<number, number> = {};
    let unknownCategory = 0;
    const byStatus = { open: 0, in_progress: 0, resolved: 0, closed: 0 };
    const byWorkType = { incident: 0, request: 0, change: 0, other: 0 };

    (data ?? []).forEach((t) => {
      const created = t.created_at ? toKstDate(new Date(t.created_at)) : null;
      const updated = t.updated_at ? toKstDate(new Date(t.updated_at)) : created;
      const status = (t.status || "").toLowerCase();

      if (status === "open" || status === "in_progress") totalPending++;
      if (created && created >= today) todayNew++;
      if (created && created >= yesterday && created < today) yesterdayNew++;
      if (updated && updated >= today && status === "resolved") todayDone++;
      if (updated && updated >= yesterday && updated < today && status === "resolved") yesterdayDone++;

      if (t.category_id == null) {
        unknownCategory += 1;
      } else {
        byCategory[t.category_id] = (byCategory[t.category_id] || 0) + 1;
      }

      if (status === "open") byStatus.open++;
      else if (status === "in_progress") byStatus.in_progress++;
      else if (status === "resolved") byStatus.resolved++;
      else if (status === "closed") byStatus.closed++;

      const wt = (t.work_type ?? "other") as keyof typeof byWorkType;
      if (wt in byWorkType) byWorkType[wt] += 1;
      else byWorkType.other += 1;
    });

    const newTrend = yesterdayNew > 0 ? ((todayNew - yesterdayNew) / yesterdayNew) * 100 : 0;
    const doneTrend = yesterdayDone > 0 ? ((todayDone - yesterdayDone) / yesterdayDone) * 100 : 0;

    return {
      todayNew,
      todayDone,
      totalPending,
      totalTickets,
      newTrend,
      doneTrend,
      byCategory,
      unknownCategory,
      byStatus,
      byWorkType,
    };
  }, [data]);

  const categoryChartData = useMemo(() => {
    if (categories.length) {
      return categories.map((category) => {
        const base = stats.byCategory[category.id] ?? 0;
        const value = category.code === "etc" ? base + (stats.unknownCategory ?? 0) : base;
        return { label: category.name, value };
      });
    }
    return Object.entries(stats.byCategory).map(([key, value]) => ({
      label: categoryMap[Number(key)] ?? key,
      value,
    }));
  }, [stats.byCategory, stats.unknownCategory, categoryMap, categories]);

  const statusChartData = [
    { label: "대기", value: stats.byStatus.open },
    { label: "진행", value: stats.byStatus.in_progress },
    { label: "완료", value: stats.byStatus.resolved },
    { label: "사업 검토", value: stats.byStatus.closed },
  ];

  const workTypeChartData = [
    { label: "장애", value: stats.byWorkType.incident },
    { label: "요청", value: stats.byWorkType.request },
    { label: "변경", value: stats.byWorkType.change },
    { label: "기타", value: stats.byWorkType.other },
  ];

  const formatCategoryLabel = (label: string) => {
    if (label === "VDI(Gabia DaaS)") {
      return (
        <>
          VDI
          <br />
          (Gabia DaaS)
        </>
      );
    }
    if (label === "MIS(일반행정)") {
      return (
        <>
          MIS
          <br />
          (일반행정)
        </>
      );
    }
    return label;
  };

  const timeSeriesData = useMemo(() => {
    const tickets = data ?? [];
    const now = startOfKstDay(new Date());
    const periods = range === "monthly" ? 12 : range === "weekly" ? 12 : 30;
    const labels: string[] = [];
    const values: number[] = [];

    if (range === "monthly") {
      for (let i = periods - 1; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        labels.push(`${d.getFullYear()}년 ${d.getMonth() + 1}월`);
        values.push(0);
      }
      tickets.forEach((t) => {
        if (!t.created_at) return;
        const d = toKstDate(new Date(t.created_at));
        const idx = (d.getFullYear() - now.getFullYear()) * 12 + (d.getMonth() - now.getMonth()) + (periods - 1);
        if (idx >= 0 && idx < periods) values[idx]++;
      });
    } else if (range === "weekly") {
      for (let i = periods - 1; i >= 0; i--) {
        const d = new Date(now);
        d.setDate(d.getDate() - i * 7);
        labels.push(`${d.getMonth() + 1}/${d.getDate()}`);
        values.push(0);
      }
      tickets.forEach((t) => {
        if (!t.created_at) return;
        const key = formatWeekKey(toKstDate(new Date(t.created_at)));
        const idx = labels.findIndex((_, i) => {
          const d = new Date(now);
          d.setDate(d.getDate() - (periods - 1 - i) * 7);
          return formatWeekKey(d) === key;
        });
        if (idx >= 0) values[idx]++;
      });
    } else {
      for (let i = periods - 1; i >= 0; i--) {
        const d = new Date(now);
        d.setDate(d.getDate() - i);
        labels.push(`${d.getMonth() + 1}/${d.getDate()}`);
        values.push(0);
      }
      tickets.forEach((t) => {
        if (!t.created_at) return;
        const created = toKstDate(new Date(t.created_at));
        const diff = Math.floor((now.getTime() - created.getTime()) / (1000 * 60 * 60 * 24));
        if (diff >= 0 && diff < periods) values[periods - 1 - diff]++;
      });
    }

    return { labels, values };
  }, [data, range]);

  return (
    <div className="space-y-8">
      <div>
        <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-slate-100 px-4 py-1.5 border border-slate-200">
          <div className="h-2 w-2 rounded-full bg-slate-600 animate-pulse" />
          <span className="text-xs font-bold uppercase tracking-wider text-slate-700">Admin Dashboard</span>
        </div>
        <h1 className="text-4xl font-bold text-slate-900 tracking-tight">관리자 대시보드</h1>
        <p className="mt-2 text-base text-slate-600">IT 서비스 요청 현황과 통계를 실시간으로 모니터링합니다.</p>
      </div>

      <ErrorDialog message={errorMessage} onClose={() => setErrorMessage(null)} />

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
        <KPICard
          label="금일 신규 접수"
          value={isLoading ? "-" : stats.todayNew}
          subtitle="오늘 들어온 새 요청"
          icon="📝"
          trend={{ value: stats.newTrend, label: "전일 대비" }}
          accent="#2563eb"
          loading={isLoading}
        />
        <KPICard
          label="금일 처리 완료"
          value={isLoading ? "-" : stats.todayDone}
          subtitle="오늘 완료된 요청"
          icon="✅"
          trend={{ value: stats.doneTrend, label: "전일 대비" }}
          accent="#10b981"
          loading={isLoading}
        />
        <KPICard
          label="미처리 총 요청"
          value={isLoading ? "-" : stats.totalPending}
          subtitle="대기 + 진행"
          icon="⏳"
          accent="#f59e0b"
          loading={isLoading}
        />
        <KPICard
          label="전체 요청"
          value={isLoading ? "-" : stats.totalTickets}
          subtitle="누적 요청 건수"
          icon="📦"
          accent="#3b82f6"
          loading={isLoading}
        />
      </div>

      <ChartCard
        title="티켓 추이 분석"
        subtitle="시간대별 요청 접수 현황"
        icon="📈"
        action={
          <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-1">
            {(["daily", "weekly", "monthly"] as const).map((r) => (
              <button
                key={r}
                onClick={() => setRange(r)}
                className={`rounded-md px-4 py-2 text-sm font-semibold transition-all ${
                  range === r ? "bg-slate-900 text-white shadow-sm" : "text-slate-700 hover:bg-white hover:text-slate-900"
                }`}
              >
                {r === "daily" ? "일별" : r === "weekly" ? "주별" : "월별"}
              </button>
            ))}
          </div>
        }
      >
        <AreaChart labels={timeSeriesData.labels} values={timeSeriesData.values} color="#006334" />
      </ChartCard>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <ChartCard title="작업 유형" subtitle="요청 유형별 분류" icon="🧰" className="min-h-[320px]">
          <BarChart data={workTypeChartData} maxHeight={150} />
        </ChartCard>

        <ChartCard title="상태별 분포" subtitle="현재 티켓 진행 상태" icon="🧾" className="min-h-[320px]">
          <BarChart data={statusChartData} maxHeight={150} />
        </ChartCard>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-4">
        <ChartCard title="카테고리별 분포" subtitle="서비스 유형별 티켓 현황" icon="📊" className="lg:col-span-3 min-h-[320px]">
          <BarChart data={categoryChartData} formatLabel={formatCategoryLabel} maxHeight={150} />
        </ChartCard>

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm flex h-full flex-col lg:col-span-1">
          <div className="mb-1 flex items-center gap-2">
            <span className="text-xl">⚡</span>
            <h3 className="text-lg font-bold text-slate-900">빠른 이동</h3>
          </div>
          <p className="mb-6 text-sm text-slate-600">자주 사용하는 관리자 기능</p>
          <div className="space-y-2">
            {[
              { title: "사용자 관리", href: "/admin/users", icon: "👥" },
              { title: "요청 관리", href: "/admin/tickets", icon: "📌" },
              { title: "모든 요청 관리", href: "/admin/tickets/all", icon: "🗂" },
            ].map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="group flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 transition-all hover:border-slate-300 hover:bg-slate-50"
              >
                <span className="text-xl">{item.icon}</span>
                <span className="flex-1 text-sm font-semibold text-slate-900 group-hover:text-slate-700">
                  {item.title}
                </span>
                <svg
                  className="h-5 w-5 text-slate-400 transition-all group-hover:translate-x-1 group-hover:text-slate-500"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
                </svg>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

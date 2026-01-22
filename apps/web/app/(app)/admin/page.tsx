"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
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

function RadialChart({
  data,
  size = 180,
  thickness = 24,
}: {
  data: { label: string; value: number }[];
  size?: number;
  thickness?: number;
}) {
  const total = data.reduce((acc, cur) => acc + cur.value, 0);
  const palette = ["#2563eb", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#14b8a6", "#64748b", "#f97316"];
  let acc = 0;
  const segments = data.map((d, i) => {
    const pct = total > 0 ? (d.value / total) * 100 : 0;
    const start = acc;
    acc += pct;
    return { ...d, pct, start, end: acc, color: palette[i % palette.length] };
  });
  const gradient =
    total > 0
      ? `conic-gradient(${segments
          .map((s) => `${s.color} ${s.start.toFixed(2)}% ${s.end.toFixed(2)}%`)
          .join(", ")})`
      : "conic-gradient(#e5e7eb 0% 100%)";

  return (
    <div className="flex flex-wrap items-center gap-6">
      <div className="relative" style={{ width: size, height: size }}>
        <div className="h-full w-full rounded-full" style={{ background: gradient }} />
        <div
          className="absolute inset-0 m-auto rounded-full bg-white flex items-center justify-center text-sm font-semibold text-slate-800"
          style={{ width: size - thickness * 2, height: size - thickness * 2 }}
        >
          {total}건
        </div>
      </div>
      <div className="min-w-[180px] flex-1 space-y-2 max-h-[220px] overflow-auto">
        {segments.map((s) => (
          <div key={s.label} className="flex items-center justify-between gap-3 text-sm">
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: s.color }} />
              <span className="text-slate-700">{s.label}</span>
            </div>
            <span className="font-semibold text-slate-900">{s.value}</span>
          </div>
        ))}
      </div>
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
  const hoverRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);

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
          const target = e.currentTarget;
          const rect = target.getBoundingClientRect();
          const x = ((e.clientX - rect.left) / rect.width) * width;
          if (rafRef.current) cancelAnimationFrame(rafRef.current);
          rafRef.current = requestAnimationFrame(() => {
            let nearest = 0;
            let min = Number.POSITIVE_INFINITY;
            for (let i = 0; i < points.length; i += 1) {
              const dist = Math.abs(points[i].x - x);
              if (dist < min) {
                min = dist;
                nearest = i;
              }
            }
            if (hoverRef.current !== nearest) {
              hoverRef.current = nearest;
              setHoverIdx(nearest);
            }
          });
        }}
        onMouseLeave={() => {
          hoverRef.current = null;
          setHoverIdx(null);
        }}
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
          className="absolute z-10 -translate-x-1/2 -translate-y-full rounded-lg border border-slate-200 bg-white px-4 py-2 shadow-xl pointer-events-none"
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
const DAY_MS = 24 * 60 * 60 * 1000;

function kstMidnightTs(date: Date) {
  const kst = new Date(date.getTime() + KST_OFFSET_MS);
  return Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), kst.getUTCDate()) - KST_OFFSET_MS;
}

function kstDayDiff(a: Date, b: Date) {
  return Math.floor((kstMidnightTs(a) - kstMidnightTs(b)) / DAY_MS);
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
    const todayStartTs = kstMidnightTs(now);
    const yesterdayStartTs = todayStartTs - DAY_MS;

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
      const createdTs = t.created_at ? new Date(t.created_at).getTime() : null;
      const updatedTs = t.updated_at ? new Date(t.updated_at).getTime() : createdTs;
      const status = (t.status || "").toLowerCase();

      if (status === "open" || status === "in_progress") totalPending++;
      if (createdTs !== null && createdTs >= todayStartTs) todayNew++;
      if (createdTs !== null && createdTs >= yesterdayStartTs && createdTs < todayStartTs) yesterdayNew++;
      if (updatedTs !== null && updatedTs >= todayStartTs && (status === "resolved" || status === "closed")) {
        todayDone++;
      }
      if (updatedTs !== null && updatedTs >= yesterdayStartTs && updatedTs < todayStartTs) {
        if (status === "resolved" || status === "closed") yesterdayDone++;
      }

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

    const newTrend = yesterdayNew === 0 ? (todayNew === 0 ? 0 : 100) : ((todayNew - yesterdayNew) / yesterdayNew) * 100;
    const doneTrend =
      yesterdayDone === 0 ? (todayDone === 0 ? 0 : 100) : ((todayDone - yesterdayDone) / yesterdayDone) * 100;

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

  const timeSeriesData = useMemo(() => {
    const tickets = data ?? [];
    const now = new Date(kstMidnightTs(new Date()));
    const periods = range === "monthly" ? 12 : range === "weekly" ? 12 : 30;
    const labels: string[] = [];
    const values: number[] = [];

    if (range === "monthly") {
      for (let i = periods - 1; i >= 0; i--) {
        const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
        labels.push(`${d.getFullYear()}년 ${d.getMonth() + 1}월`);
        values.push(0);
      }
      tickets.forEach((t) => {
        if (!t.created_at) return;
        const d = new Date(new Date(t.created_at).getTime() + KST_OFFSET_MS);
        const idx =
          (d.getUTCFullYear() - now.getUTCFullYear()) * 12 + (d.getUTCMonth() - now.getUTCMonth()) + (periods - 1);
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
        const key = formatWeekKey(new Date(new Date(t.created_at).getTime() + KST_OFFSET_MS));
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
        const created = new Date(new Date(t.created_at).getTime() + KST_OFFSET_MS);
        const diff = kstDayDiff(now, created);
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
        title="요청 추이 분석"
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
          <RadialChart data={workTypeChartData} />
        </ChartCard>

        <ChartCard title="상태별 분포" subtitle="현재 요청 진행 상태" icon="🧾" className="min-h-[320px]">
          <RadialChart data={statusChartData} />
        </ChartCard>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-4">
        <ChartCard title="카테고리별 분포" subtitle="서비스 유형별 요청 현황" icon="📊" className="lg:col-span-3 min-h-[320px]">
          <RadialChart data={categoryChartData} />
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

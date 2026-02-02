"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { useMe } from "@/lib/auth-context";
import { useTicketCategories } from "@/lib/use-ticket-categories";
import ErrorDialog from "@/components/ErrorDialog";
import PageHeader from "@/components/PageHeader";
import { StatCard } from "@/components/ui";
import { Card, CardHeader, CardBody } from "@/components/ui";
import {
  FileText,
  CheckCircle2,
  Clock,
  Package,
  TrendingUp,
  Wrench,
  ClipboardList,
  PieChart as PieChartIcon,
  BarChart3,
  FolderOpen,
  ArrowRight,
  Building2,
  UserCircle
} from "lucide-react";
import {
  PieChart as RechartsPieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  AreaChart as RechartsAreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";

type Ticket = {
  id: number;
  status: string;
  category_id?: number | null;
  work_type?: string | null;
  created_at?: string;
  updated_at?: string;
  requester?: { title?: string | null; department?: string | null } | null;
};

// KPICard removed - using StatCard 2.0 from ui library

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
  icon?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Card className={className} padding="lg">
      <div className="mb-6 flex items-start justify-between">
        <div className="flex items-start gap-3">
          {icon && (
            <div
              className="flex h-10 w-10 items-center justify-center rounded-lg"
              style={{
                backgroundColor: "var(--color-primary-100)",
                color: "var(--color-primary-700)",
              }}
            >
              {icon}
            </div>
          )}
          <div>
            <h3 className="text-lg font-bold" style={{ color: "var(--text-primary)" }}>
              {title}
            </h3>
            {subtitle && (
              <p className="mt-1 text-sm" style={{ color: "var(--text-secondary)" }}>
                {subtitle}
              </p>
            )}
          </div>
        </div>
        {action}
      </div>
      {children}
    </Card>
  );
}

const DONUT_PALETTE = ["#2563eb", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#14b8a6", "#64748b", "#f97316"];

function DonutChart({ data }: { data: { label: string; value: number }[] }) {
  const chartData = useMemo(() => {
    const filtered = data.filter((d) => d.value > 0);
    return filtered.map((d, i) => ({
      ...d,
      name: d.label,
      fill: DONUT_PALETTE[i % DONUT_PALETTE.length],
    }));
  }, [data]);
  const total = chartData.reduce((acc, cur) => acc + cur.value, 0);

  if (chartData.length === 0) {
    return (
      <div
        className="flex min-h-[280px] flex-col items-center justify-center rounded-xl border border-dashed py-12 px-6"
        style={{
          borderColor: "var(--border-default)",
          backgroundColor: "var(--bg-elevated)",
        }}
      >
        <div
          className="mb-3 flex h-14 w-14 items-center justify-center rounded-full"
          style={{
            backgroundColor: "var(--color-primary-100)",
            color: "var(--color-primary-600)",
          }}
        >
          <PieChartIcon className="h-7 w-7" />
        </div>
        <p className="text-sm font-medium" style={{ color: "var(--text-secondary)" }}>
          데이터가 없습니다
        </p>
        <p className="mt-1 text-xs" style={{ color: "var(--text-tertiary)" }}>
          해당 기간에 요청이 없습니다
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-6">
      <div className="relative w-full min-w-[280px] max-w-[360px]" style={{ height: 340 }}>
        <ResponsiveContainer width="100%" height="100%">
          <RechartsPieChart>
            <Pie
              data={chartData}
              dataKey="value"
              nameKey="label"
              cx="50%"
              cy="50%"
              innerRadius="55%"
              outerRadius="85%"
              paddingAngle={1}
            >
              {chartData.map((_, i) => (
                <Cell key={i} fill={chartData[i].fill} stroke="var(--bg-card)" strokeWidth={2} />
              ))}
            </Pie>
            <Tooltip
              content={({ active, payload }) =>
                active && payload?.[0] ? (
                  <div
                    className="rounded-lg border px-3 py-2 shadow-md"
                    style={{
                      backgroundColor: "var(--bg-card)",
                      borderColor: "var(--border-default)",
                    }}
                  >
                    <span style={{ color: "var(--text-secondary)" }}>{payload[0].payload.label}</span>
                    <span className="ml-2 font-semibold" style={{ color: "var(--text-primary)" }}>
                      {payload[0].value}건
                    </span>
                  </div>
                ) : null
              }
            />
          </RechartsPieChart>
        </ResponsiveContainer>
        {total > 0 && (
          <div
            className="pointer-events-none absolute inset-0 flex items-center justify-center"
            style={{ color: "var(--text-primary)", fontSize: "0.9rem" }}
          >
            <span className="font-bold">{total}건</span>
          </div>
        )}
      </div>
      <div className="min-w-[180px] flex-1 space-y-2.5 max-h-[300px] overflow-auto">
        {chartData.map((s) => (
          <div key={s.label} className="flex items-center gap-2 text-base">
            <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: s.fill }} />
            <span style={{ color: "var(--text-secondary)" }}>{s.label}</span>
            <span className="font-semibold" style={{ color: "var(--text-primary)" }}>
              {s.value}건
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** 요청 추이 분석용 영역 차트. Ignite UI 영역 차트 스타일: Y축 0 시작, 반투명 영역, 두꺼운 선, 마커 강조 */
function AreaChart({
  labels,
  values,
  color = "#10b981",
}: {
  labels: string[];
  values: number[];
  color?: string;
}) {
  const chartData = useMemo(
    () => labels.map((name, i) => ({ name, value: values[i] ?? 0 })),
    [labels, values]
  );
  const maxVal = Math.max(1, ...values);

  return (
    <div className="w-full" style={{ height: 280 }}>
      <ResponsiveContainer width="100%" height="100%">
        <RechartsAreaChart
          data={chartData}
          margin={{ top: 12, right: 12, left: 8, bottom: 8 }}
        >
          <defs>
            <linearGradient id="areaFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.35} />
              <stop offset="100%" stopColor={color} stopOpacity={0.08} />
            </linearGradient>
          </defs>
          <CartesianGrid
            strokeDasharray="4 4"
            vertical={false}
            stroke="var(--border-subtle)"
          />
          <XAxis
            dataKey="name"
            axisLine={false}
            tickLine={false}
            tick={{ fontSize: 12, fill: "var(--text-tertiary)" }}
            interval="preserveStartEnd"
          />
          <YAxis
            domain={[0, maxVal]}
            axisLine={false}
            tickLine={false}
            tick={{ fontSize: 12, fill: "var(--text-tertiary)" }}
            tickFormatter={(v) => String(v)}
          />
          <Tooltip
            content={({ active, payload }) =>
              active && payload?.[0] ? (
                <div
                  className="rounded-lg border px-3 py-2 shadow-md"
                  style={{
                    backgroundColor: "var(--bg-card)",
                    borderColor: "var(--border-default)",
                  }}
                >
                  <div className="text-xs" style={{ color: "var(--text-secondary)" }}>
                    {payload[0].payload.name}
                  </div>
                  <div className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>
                    {payload[0].value}건
                  </div>
                </div>
              ) : null
            }
          />
          <Area
            type="monotone"
            dataKey="value"
            stroke={color}
            strokeWidth={2.5}
            fill="url(#areaFill)"
            dot={{ fill: "var(--bg-card)", stroke: color, strokeWidth: 2, r: 4 }}
            activeDot={{ r: 5, strokeWidth: 2, fill: "var(--bg-card)", stroke: color }}
          />
        </RechartsAreaChart>
      </ResponsiveContainer>
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

function kstMonthStartTs(date: Date) {
  const kst = new Date(date.getTime() + KST_OFFSET_MS);
  return Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), 1) - KST_OFFSET_MS;
}

function kstWeekStartTs(date: Date) {
  // Monday 00:00 기준 (KST)
  const kst = new Date(date.getTime() + KST_OFFSET_MS);
  const dow = kst.getUTCDay(); // KST의 요일
  const diff = (dow + 6) % 7; // Mon=0, Tue=1, ... Sun=6
  return (
    Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), kst.getUTCDate() - diff) - KST_OFFSET_MS
  );
}

function formatKstMd(ts: number) {
  const d = new Date(ts + KST_OFFSET_MS);
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
}

function formatWeekLabel(weekStartTs: number) {
  const endTs = weekStartTs + 6 * DAY_MS;
  return `${formatKstMd(weekStartTs)}~${formatKstMd(endTs)}`;
}

function filterTicketsByDonutRange<T extends { created_at?: string | null }>(items: T[], range: "daily" | "monthly" | "all"): T[] {
  if (range === "all" || !items.length) return items;
  const now = new Date();
  const todayStart = kstMidnightTs(now);
  const monthStart = kstMonthStartTs(now);
  const nextMonthStart = new Date(monthStart);
  nextMonthStart.setUTCMonth(nextMonthStart.getUTCMonth() + 1);
  const nextMonthStartTs = nextMonthStart.getTime();
  return items.filter((t) => {
    const ts = t.created_at ? new Date(t.created_at).getTime() : 0;
    if (range === "daily") return ts >= todayStart;
    return ts >= monthStart && ts < nextMonthStartTs;
  });
}

function donutRangeButtons(
  range: "daily" | "monthly" | "all",
  setRange: (r: "daily" | "monthly" | "all") => void
) {
  return (
    <div
      className="inline-flex rounded-lg border p-1"
      style={{
        borderColor: "var(--border-default)",
        backgroundColor: "var(--bg-subtle)",
      }}
    >
      {(["daily", "monthly", "all"] as const).map((r) => (
        <button
          key={r}
          type="button"
          onClick={() => setRange(r)}
          className="rounded-md px-3 py-1.5 text-sm font-semibold transition-all"
          style={{
            backgroundColor: range === r ? "var(--color-primary-600)" : "transparent",
            color: range === r ? "white" : "var(--text-secondary)",
          }}
          onMouseEnter={(e) => {
            if (range !== r) {
              e.currentTarget.style.backgroundColor = "var(--bg-card)";
              e.currentTarget.style.color = "var(--text-primary)";
            }
          }}
          onMouseLeave={(e) => {
            if (range !== r) {
              e.currentTarget.style.backgroundColor = "transparent";
              e.currentTarget.style.color = "var(--text-secondary)";
            }
          }}
        >
          {r === "daily" ? "일별" : r === "monthly" ? "월별" : "전체"}
        </button>
      ))}
    </div>
  );
}

export default function AdminDashboard() {
  const me = useMe();
  const router = useRouter();
  const { categories, map: categoryMap } = useTicketCategories();
  const [range, setRange] = useState<"daily" | "weekly" | "monthly">("daily");
  const [donutRangeWorkType, setDonutRangeWorkType] = useState<"daily" | "monthly" | "all">("daily");
  const [donutRangeStatus, setDonutRangeStatus] = useState<"daily" | "monthly" | "all">("daily");
  const [donutRangeTitle, setDonutRangeTitle] = useState<"daily" | "monthly" | "all">("daily");
  const [donutRangeDept, setDonutRangeDept] = useState<"daily" | "monthly" | "all">("daily");
  const [donutRangeCategory, setDonutRangeCategory] = useState<"daily" | "monthly" | "all">("daily");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (me.role !== "admin") {
    router.replace("/home");
    return null;
  }

  const { data, isLoading, error } = useQuery({
    queryKey: ["admin-dashboard-tickets"],
    queryFn: () => api<Ticket[]>("/tickets?scope=all&limit=1000&offset=0"),
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

    const newTrendRaw =
      yesterdayNew === 0 ? (todayNew === 0 ? 0 : 100) : ((todayNew - yesterdayNew) / yesterdayNew) * 100;
    const doneTrendRaw =
      yesterdayDone === 0 ? (todayDone === 0 ? 0 : 100) : ((todayDone - yesterdayDone) / yesterdayDone) * 100;
    const newTrend = Math.round(newTrendRaw * 10) / 10;
    const doneTrend = Math.round(doneTrendRaw * 10) / 10;

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

  const workTypeFiltered = useMemo(() => filterTicketsByDonutRange(data ?? [], donutRangeWorkType), [data, donutRangeWorkType]);
  const statusFiltered = useMemo(() => filterTicketsByDonutRange(data ?? [], donutRangeStatus), [data, donutRangeStatus]);
  const titleFiltered = useMemo(() => filterTicketsByDonutRange(data ?? [], donutRangeTitle), [data, donutRangeTitle]);
  const deptFiltered = useMemo(() => filterTicketsByDonutRange(data ?? [], donutRangeDept), [data, donutRangeDept]);
  const categoryFiltered = useMemo(() => filterTicketsByDonutRange(data ?? [], donutRangeCategory), [data, donutRangeCategory]);

  const workTypeChartData = useMemo(() => {
    const byWorkType = { incident: 0, request: 0, change: 0, other: 0 };
    workTypeFiltered.forEach((t) => {
      const wt = (t.work_type ?? "other") as keyof typeof byWorkType;
      if (wt in byWorkType) byWorkType[wt] += 1;
      else byWorkType.other += 1;
    });
    return [
      { label: "장애", value: byWorkType.incident },
      { label: "요청", value: byWorkType.request },
      { label: "변경", value: byWorkType.change },
      { label: "기타", value: byWorkType.other },
    ];
  }, [workTypeFiltered]);

  const statusChartData = useMemo(() => {
    const byStatus = { open: 0, in_progress: 0, resolved: 0, closed: 0 };
    statusFiltered.forEach((t) => {
      const s = (t.status || "").toLowerCase();
      if (s === "open") byStatus.open++;
      else if (s === "in_progress") byStatus.in_progress++;
      else if (s === "resolved") byStatus.resolved++;
      else if (s === "closed") byStatus.closed++;
    });
    return [
      { label: "대기", value: byStatus.open },
      { label: "진행", value: byStatus.in_progress },
      { label: "완료", value: byStatus.resolved },
      { label: "사업 검토", value: byStatus.closed },
    ];
  }, [statusFiltered]);

  const requesterTitleChartData = useMemo(() => {
    const byTitle: Record<string, number> = {};
    titleFiltered.forEach((t) => {
      const label = (t.requester?.title ?? "").trim() || "미기재";
      byTitle[label] = (byTitle[label] ?? 0) + 1;
    });
    return Object.entries(byTitle).map(([label, value]) => ({ label, value }));
  }, [titleFiltered]);

  const requesterDepartmentChartData = useMemo(() => {
    const byDept: Record<string, number> = {};
    deptFiltered.forEach((t) => {
      const label = (t.requester?.department ?? "").trim() || "미기재";
      byDept[label] = (byDept[label] ?? 0) + 1;
    });
    return Object.entries(byDept).map(([label, value]) => ({ label, value }));
  }, [deptFiltered]);

  const categoryChartData = useMemo(() => {
    const byCategory: Record<number, number> = {};
    let unknownCategory = 0;
    categoryFiltered.forEach((t) => {
      if (t.category_id == null) unknownCategory += 1;
      else byCategory[t.category_id] = (byCategory[t.category_id] ?? 0) + 1;
    });
    if (categories.length) {
      return categories.map((category) => {
        const base = byCategory[category.id] ?? 0;
        const value = category.code === "etc" ? base + unknownCategory : base;
        return { label: category.name, value };
      });
    }
    return Object.entries(byCategory).map(([key, value]) => ({
      label: categoryMap[Number(key)] ?? key,
      value,
    }));
  }, [categoryFiltered, categoryMap, categories]);

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
      // "주별"은 달력 주(월~일) 기준으로 집계.
      // 이번 주는 월요일~오늘까지(week-to-date)만 자연스럽게 누적됨.
      const currentWeekStartTs = kstWeekStartTs(now);
      const baseWeekStartTs = currentWeekStartTs - (periods - 1) * 7 * DAY_MS;

      for (let i = 0; i < periods; i++) {
        const weekStartTs = baseWeekStartTs + i * 7 * DAY_MS;
        labels.push(formatWeekLabel(weekStartTs));
        values.push(0);
      }

      tickets.forEach((t) => {
        if (!t.created_at) return;
        const createdTs = new Date(t.created_at).getTime();
        const weekStartTs = kstWeekStartTs(new Date(createdTs));
        const idx = Math.floor((weekStartTs - baseWeekStartTs) / (7 * DAY_MS));
        if (idx >= 0 && idx < periods) values[idx]++;
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
    <div className="space-y-6 animate-fadeIn">
      <PageHeader
        eyebrow="Admin Dashboard"
        title="관리자 대시보드"
        subtitle="IT 서비스 요청 현황과 통계를 실시간으로 모니터링합니다."
        icon={<BarChart3 className="w-7 h-7" strokeWidth={2} />}
      />

      <ErrorDialog message={errorMessage} onClose={() => setErrorMessage(null)} />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="금일 신규 접수"
          value={isLoading ? "-" : stats.todayNew}
          subtitle="오늘 들어온 새 요청"
          icon={<FileText className="w-6 h-6" />}
          trend={{ value: stats.newTrend, label: "전일 대비" }}
          variant="info"
          loading={isLoading}
        />
        <StatCard
          title="금일 처리 완료"
          value={isLoading ? "-" : stats.todayDone}
          subtitle="오늘 완료된 요청"
          icon={<CheckCircle2 className="w-6 h-6" />}
          trend={{ value: stats.doneTrend, label: "전일 대비" }}
          variant="success"
          loading={isLoading}
        />
        <StatCard
          title="미처리 총 요청"
          value={isLoading ? "-" : stats.totalPending}
          subtitle="대기 + 진행"
          icon={<Clock className="w-6 h-6" />}
          variant="warning"
          loading={isLoading}
        />
        <StatCard
          title="전체 요청"
          value={isLoading ? "-" : stats.totalTickets}
          subtitle="누적 요청 건수"
          icon={<Package className="w-6 h-6" />}
          variant="primary"
          loading={isLoading}
        />
      </div>

      <ChartCard
        title="요청 추이 분석"
        subtitle="기간별 요청 접수 현황"
        icon={<TrendingUp className="w-5 h-5" />}
        action={
          <div
            className="inline-flex rounded-lg border p-1"
            style={{
              borderColor: "var(--border-default)",
              backgroundColor: "var(--bg-subtle)",
            }}
          >
            {(["daily", "weekly", "monthly"] as const).map((r) => (
              <button
                key={r}
                onClick={() => setRange(r)}
                className="rounded-md px-4 py-2 text-sm font-semibold transition-all"
                style={{
                  backgroundColor: range === r ? "var(--color-primary-600)" : "transparent",
                  color: range === r ? "white" : "var(--text-secondary)",
                }}
                onMouseEnter={(e) => {
                  if (range !== r) {
                    e.currentTarget.style.backgroundColor = "var(--bg-card)";
                    e.currentTarget.style.color = "var(--text-primary)";
                  }
                }}
                onMouseLeave={(e) => {
                  if (range !== r) {
                    e.currentTarget.style.backgroundColor = "transparent";
                    e.currentTarget.style.color = "var(--text-secondary)";
                  }
                }}
              >
                {r === "daily" ? "일별" : r === "weekly" ? "주별" : "월별"}
              </button>
            ))}
          </div>
        }
      >
        <AreaChart labels={timeSeriesData.labels} values={timeSeriesData.values} color="#10b981" />
      </ChartCard>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartCard
          title="작업 유형"
          subtitle="요청 유형별 분류"
          icon={<Wrench className="w-5 h-5" />}
          className="min-h-[360px]"
          action={donutRangeButtons(donutRangeWorkType, setDonutRangeWorkType)}
        >
          <DonutChart data={workTypeChartData} />
        </ChartCard>

        <ChartCard
          title="상태"
          subtitle="요청 상태별 분류"
          icon={<ClipboardList className="w-5 h-5" />}
          className="min-h-[360px]"
          action={donutRangeButtons(donutRangeStatus, setDonutRangeStatus)}
        >
          <DonutChart data={statusChartData} />
        </ChartCard>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartCard
          title="직급"
          subtitle="요청자 직급별 분류"
          icon={<UserCircle className="w-5 h-5" />}
          className="min-h-[360px]"
          action={donutRangeButtons(donutRangeTitle, setDonutRangeTitle)}
        >
          <DonutChart data={requesterTitleChartData} />
        </ChartCard>
        <ChartCard
          title="부서"
          subtitle="요청자 부서별 분류"
          icon={<Building2 className="w-5 h-5" />}
          className="min-h-[360px]"
          action={donutRangeButtons(donutRangeDept, setDonutRangeDept)}
        >
          <DonutChart data={requesterDepartmentChartData} />
        </ChartCard>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-4">
        <ChartCard
          title="카테고리"
          subtitle="서비스 유형별 분류"
          icon={<PieChartIcon className="w-5 h-5" />}
          className="lg:col-span-3 min-h-[360px]"
          action={donutRangeButtons(donutRangeCategory, setDonutRangeCategory)}
        >
          <DonutChart data={categoryChartData} />
        </ChartCard>

        <div className="flex flex-col gap-3 lg:col-span-1">
          <Link
            href="/admin/tickets/all"
            className="flex items-center justify-center gap-2 rounded-xl border-2 p-4 transition-all"
            style={{
              borderColor: "var(--border-default)",
              backgroundColor: "var(--bg-card)",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = "var(--color-primary-500)";
              e.currentTarget.style.backgroundColor = "var(--bg-hover)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = "var(--border-default)";
              e.currentTarget.style.backgroundColor = "var(--bg-card)";
            }}
          >
            <FolderOpen className="h-5 w-5" style={{ color: "var(--color-primary-600)" }} />
            <span className="font-semibold" style={{ color: "var(--text-primary)" }}>
              모든 요청 보기
            </span>
            <ArrowRight className="h-4 w-4" style={{ color: "var(--text-tertiary)" }} />
          </Link>
          <Link
            href="/admin/data"
            className="flex items-center justify-center gap-2 rounded-xl border-2 p-4 transition-all"
            style={{
              borderColor: "var(--border-default)",
              backgroundColor: "var(--bg-card)",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = "var(--color-primary-500)";
              e.currentTarget.style.backgroundColor = "var(--bg-hover)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = "var(--border-default)";
              e.currentTarget.style.backgroundColor = "var(--bg-card)";
            }}
          >
            <BarChart3 className="h-5 w-5" style={{ color: "var(--color-primary-600)" }} />
            <span className="font-semibold" style={{ color: "var(--text-primary)" }}>
              통계페이지로 이동
            </span>
            <ArrowRight className="h-4 w-4" style={{ color: "var(--text-tertiary)" }} />
          </Link>
        </div>
      </div>
    </div>
  );
}

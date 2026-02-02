/**
 * 데이터 추출 페이지: 타입, 컬럼 정의, 라벨, 값 추출 유틸
 */

export type Ticket = {
  id: number;
  title: string;
  status: string;
  priority: string;
  work_type?: string | null;
  category_id?: number | null;
  category_ids?: number[];
  project_id?: number | null;
  project_name?: string | null;
  requester_emp_no: string;
  assignee_emp_no?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  resolved_at?: string | null;
  closed_at?: string | null;
  reopen_count?: number;
  requester?: { kor_name?: string | null; title?: string | null; department?: string | null } | null;
  assignee?: { kor_name?: string | null } | null;
  assignees?: { kor_name?: string | null }[] | null;
};

export type ColDef =
  | { key: string; label: string; section: string; hasDataFilter: false }
  | { key: string; label: string; section: string; hasDataFilter: true }
  | { key: string; label: string; section: string; hasDataFilter: "created_at" };

export const SECTION_ORDER = ["기본정보", "프로젝트·분류", "요청자", "담당", "일시·재요청"] as const;

export const COLUMN_DEFS: ColDef[] = [
  { key: "id", label: "ID", section: "기본정보", hasDataFilter: false },
  { key: "title", label: "제목", section: "기본정보", hasDataFilter: false },
  { key: "status", label: "상태", section: "기본정보", hasDataFilter: true },
  { key: "priority", label: "우선순위", section: "기본정보", hasDataFilter: true },
  { key: "work_type", label: "작업유형", section: "기본정보", hasDataFilter: true },
  { key: "project_name", label: "프로젝트", section: "프로젝트·분류", hasDataFilter: true },
  { key: "category_display", label: "카테고리", section: "프로젝트·분류", hasDataFilter: true },
  { key: "requester_name", label: "요청자 이름", section: "요청자", hasDataFilter: false },
  { key: "requester_title", label: "요청자 직급", section: "요청자", hasDataFilter: true },
  { key: "requester_department", label: "요청자 부서", section: "요청자", hasDataFilter: true },
  { key: "assignee_display", label: "담당자", section: "담당", hasDataFilter: true },
  { key: "created_at", label: "생성일시", section: "일시·재요청", hasDataFilter: "created_at" },
  { key: "updated_at", label: "완료일시", section: "일시·재요청", hasDataFilter: false },
  { key: "reopen_count", label: "재요청 횟수", section: "일시·재요청", hasDataFilter: false },
];

export const STATUS_LABELS: Record<string, string> = {
  open: "접수",
  in_progress: "진행",
  resolved: "완료",
  closed: "사업검토",
};

export const PRIORITY_LABELS: Record<string, string> = {
  low: "낮음",
  medium: "보통",
  high: "높음",
};

export const WORK_TYPE_LABELS: Record<string, string> = {
  incident: "장애",
  request: "요청",
  change: "변경",
  other: "기타",
};

export function getDisplayLabel(key: string, value: string): string {
  if (key === "status") return STATUS_LABELS[value] ?? value;
  if (key === "priority") return PRIORITY_LABELS[value] ?? value;
  if (key === "work_type") return WORK_TYPE_LABELS[value] ?? value;
  return value;
}

/** admin/data 전용: YYYY-MM-DD HH:mm:ss */
function formatDateTimeISO(raw: string | null | undefined): string {
  if (raw == null) return "-";
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return "-";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const h = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  const s = String(d.getSeconds()).padStart(2, "0");
  return `${y}-${m}-${day} ${h}:${min}:${s}`;
}

export function getValue(
  t: Ticket,
  key: string,
  opts?: { categoryMap?: Record<number, string> }
): string {
  if (key === "requester_name") return t.requester?.kor_name ?? t.requester_emp_no ?? "-";
  if (key === "requester_title") return t.requester?.title ?? "-";
  if (key === "requester_department") return t.requester?.department ?? "-";
  if (key === "category_display") {
    const ids = t.category_ids ?? (t.category_id != null ? [t.category_id] : []);
    const map = opts?.categoryMap ?? {};
    const names = ids.map((id) => map[id] ?? String(id)).filter(Boolean);
    return names.length ? names.join(", ") : "-";
  }
  if (key === "assignee_display") {
    const list = t.assignees ?? (t.assignee ? [t.assignee] : []);
    const names = list.map((a) => a?.kor_name).filter(Boolean);
    return names.length ? names.join(", ") : t.assignee_emp_no ?? "-";
  }
  if (key === "work_type") {
    const raw = t.work_type;
    if (raw == null || raw === "") return "-";
    return WORK_TYPE_LABELS[raw] ?? raw;
  }
  if (key === "created_at") {
    return formatDateTimeISO(t.created_at);
  }
  if (key === "updated_at") {
    // 완료일시: resolved_at(완료) 또는 closed_at(사업검토)
    if (t.status === "resolved" && t.resolved_at) return formatDateTimeISO(t.resolved_at);
    if (t.status === "closed" && t.closed_at) return formatDateTimeISO(t.closed_at);
    return "-";
  }
  if (key === "reopen_count") return String(t.reopen_count ?? 0);
  const v = (t as Record<string, unknown>)[key];
  if (v == null) return "-";
  if (typeof v === "string") return v;
  if (Array.isArray(v)) return v.join(", ");
  return String(v);
}

export function dayOfYear(d: Date): number {
  const start = new Date(d.getFullYear(), 0, 0);
  return Math.floor((d.getTime() - start.getTime()) / (24 * 60 * 60 * 1000));
}

export function formatDayOfYearPercent(pct: number): string {
  const day = Math.min(366, Math.max(1, Math.round(1 + (365 * pct) / 100)));
  const d = new Date(2024, 0, day);
  return d.toLocaleDateString("ko-KR", { month: "numeric", day: "numeric" });
}

export function escapeCsvCell(s: string): string {
  if (s.includes(",") || s.includes('"') || s.includes("\n")) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

/** 필터 가능한 컬럼 키만 (created_at 제외, created_at_year는 별도) */
export const FILTERABLE_FIELDS = COLUMN_DEFS.filter(
  (c) => c.hasDataFilter === true
).map((c) => c.key);

export type FilterRule = {
  id: string;
  field: string;
  mode: "include_only" | "exclude";
  values: string[];
};

export type DataExtractPreset = {
  id: string;
  name: string;
  createdAt: string;
  createdYearInclude: string[];
  createdDayRangePercent: [number, number];
  filterRules: FilterRule[];
  selectedColumns: string[];
  columnOrder: string[];
};

const PRESET_STORAGE_KEY = "admin-data-presets";

export function loadPresetsFromStorage(): DataExtractPreset[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(PRESET_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as DataExtractPreset[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function savePresetsToStorage(presets: DataExtractPreset[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(PRESET_STORAGE_KEY, JSON.stringify(presets));
  } catch {
    // ignore
  }
}

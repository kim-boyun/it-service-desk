"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useMutation } from "@tanstack/react-query";
import { api, apiForm } from "@/lib/api";
import { useTicketCategories } from "@/lib/use-ticket-categories";
import { EMPTY_DOC, isEmptyDoc, TiptapDoc } from "@/lib/tiptap";
import { useUnsavedChangesWarning } from "@/lib/use-unsaved-changes";
import {
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  AlertTriangle,
  HelpCircle,
  Settings,
  FileText,
  Paperclip,
  X,
  ChevronRight,
} from "lucide-react";

const RichTextEditor = dynamic(() => import("@/components/RichTextEditor"), { ssr: false });

type TicketCreateIn = {
  title: string;
  description: TiptapDoc;
  category_ids: number[];
  work_type: string | null;
  project_id: number | null;
};

type TicketFormState = {
  title: string;
  description: TiptapDoc;
  category_ids: number[];
  work_type: string | null;
  project_id: number | null;
};

type TicketOut = {
  id: number;
  title: string;
};

type Project = {
  id: number;
  name: string;
  start_date?: string | null;
  end_date?: string | null;
};

type StepId =
  | "welcome"
  | "work_type"
  | "title"
  | "category"
  | "description"
  | "review";

const MAX_FILE_BYTES = 25 * 1024 * 1024;


const workTypeOptions = [
  {
    value: "incident",
    label: "장애",
    description: "시스템이 정상적으로 동작하지 않는 경우",
    icon: AlertTriangle,
    color: "danger",
  },
  {
    value: "request",
    label: "요청",
    description: "새로운 작업이나 지원을 요청하는 경우",
    icon: HelpCircle,
    color: "info",
  },
  {
    value: "change",
    label: "변경",
    description: "기존 설정이나 기능을 수정하는 경우",
    icon: Settings,
    color: "warning",
  },
  {
    value: "other",
    label: "기타",
    description: "위 항목에 명확히 해당하지 않는 경우",
    icon: FileText,
    color: "default",
  },
];

function formatBytes(bytes: number) {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(k)), sizes.length - 1);
  const value = bytes / Math.pow(k, i);
  return `${value.toFixed(value >= 10 || i === 0 ? 0 : 1)} ${sizes[i]}`;
}

function isProjectActive(project: Project) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (project.start_date) {
    const start = new Date(`${project.start_date}T00:00:00`);
    if (today < start) return false;
  }
  if (project.end_date) {
    const end = new Date(`${project.end_date}T23:59:59`);
    if (today > end) return false;
  }
  return true;
}

export default function HomePage() {
  const router = useRouter();
  const { categories, loading: categoryLoading, error: categoryError } = useTicketCategories();
  const [currentStep, setCurrentStep] = useState<StepId>("welcome");
  const [project, setProject] = useState<Project | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectLoading, setProjectLoading] = useState(false);
  const [projectError, setProjectError] = useState<string | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [dragActive, setDragActive] = useState(false);

  const [form, setForm] = useState<TicketFormState>({
    title: "",
    description: EMPTY_DOC,
    category_ids: [],
    work_type: null,
    project_id: null,
  });
  const [error, setError] = useState<string | null>(null);
  const [attachments, setAttachments] = useState<File[]>([]);

  useUnsavedChangesWarning(isDirty);

  useEffect(() => {
    let active = true;
    setProjectLoading(true);
    setProjectError(null);
    api<Project[]>("/projects?mine=false")
      .then((data) => {
        if (!active) return;
        setProjects(Array.isArray(data) ? data : []);
      })
      .catch((err: any) => {
        if (!active) return;
        setProjectError(err?.message ?? "프로젝트를 불러오지 못했습니다.");
      })
      .finally(() => {
        if (!active) return;
        setProjectLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const activeProjects = useMemo(() => {
    const filtered = projects.filter(isProjectActive);
    return [...filtered].sort((a, b) => {
      if (a.name === "없음") return -1;
      if (b.name === "없음") return 1;
      return a.name.localeCompare(b.name, "ko");
    });
  }, [projects]);

  const sortedCategories = useMemo(() => {
    return [...categories].sort((a, b) => {
      const order = (a.sort_order ?? 9999) - (b.sort_order ?? 9999);
      if (order !== 0) return order;
      return a.name.localeCompare(b.name, "ko");
    });
  }, [categories]);

  const steps: StepId[] = [
    "welcome",
    "work_type",
    "title",
    "category",
    "description",
    "review",
  ];

  const currentStepIndex = steps.indexOf(currentStep);
  const progress = ((currentStepIndex + 1) / steps.length) * 100;

  const createTicket = useMutation({
    mutationFn: async ({ form: payload, files }: { form: TicketCreateIn; files: File[] }) => {
      const created = await api<TicketOut>("/tickets", {
        method: "POST",
        body: payload,
      });

      if (files.length) {
        try {
          for (const file of files) {
            const fd = new FormData();
            fd.append("file", file);
            await apiForm(`/tickets/${created.id}/attachments/upload`, fd);
          }
        } catch (err) {
          try {
            await api(`/tickets/${created.id}`, { method: "DELETE" });
          } catch (cleanupError) {
            console.error("ticket cleanup failed after attachment error", cleanupError);
          }
          throw err;
        }
      }

      return created;
    },
    onSuccess: (res) => {
      setIsDirty(false);
      router.replace(`/tickets/${res.id}`);
    },
    onError: (err: any) => {
      const message = err?.message ?? "요청 생성에 실패했습니다.";
      if (message.includes("413")) {
        setError("첨부파일 용량이 서버 제한을 초과했습니다. 25MB 이하로 줄이거나 서버 업로드 제한을 늘려주세요.");
        return;
      }
      setError(message);
    },
  });

  function handleChange<K extends keyof TicketFormState>(key: K, value: TicketFormState[K]) {
    setIsDirty(true);
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function toggleCategory(categoryId: number) {
    setIsDirty(true);
    setForm((prev) => {
      const exists = prev.category_ids.includes(categoryId);
      const next = exists
        ? prev.category_ids.filter((id) => id !== categoryId)
        : [...prev.category_ids, categoryId];
      return { ...prev, category_ids: next };
    });
  }

  function addFiles(fileList: FileList | File[] | null) {
    if (!fileList) return;
    const files = Array.isArray(fileList) ? fileList : Array.from(fileList);
    setError(null);
    setIsDirty(true);
    setAttachments((prev) => {
      const next = [...prev];
      for (const file of files) {
        if (file.size > MAX_FILE_BYTES) {
          setError("첨부파일은 25MB 이하로만 가능합니다.");
          continue;
        }
        next.push(file);
      }
      return next;
    });
  }

  function removeFile(idx: number) {
    setIsDirty(true);
    setAttachments((prev) => prev.filter((_, i) => i !== idx));
  }

  function handleProjectSelect(selected: Project) {
    setProject(selected);
    setIsDirty(true);
    setForm((prev) => ({
      ...prev,
      project_id: selected.id,
      category_ids: prev.project_id === selected.id ? prev.category_ids : [],
    }));
  }

  function clearProject() {
    setProject(null);
    setIsDirty(true);
    setForm((prev) => ({ ...prev, project_id: null, category_ids: [] }));
  }

  function nextStep() {
    setError(null);
    const nextIndex = currentStepIndex + 1;
    if (nextIndex < steps.length) {
      setCurrentStep(steps[nextIndex]);
    }
  }

  function prevStep() {
    setError(null);
    const prevIndex = currentStepIndex - 1;
    if (prevIndex >= 0) {
      setCurrentStep(steps[prevIndex]);
    }
  }

  function canProceed(): boolean {
    switch (currentStep) {
      case "welcome":
        return true;
      case "work_type":
        return !!form.work_type;
      case "title":
        return form.title.trim().length >= 3;
      case "category":
        return !!form.project_id && form.category_ids.length > 0;
      case "description":
        return !isEmptyDoc(form.description);
      case "review":
        return true;
      default:
        return false;
    }
  }

  function handleSubmit() {
    setError(null);

    if (!form.work_type) {
      setError("작업 구분을 선택하세요.");
      return;
    }
    if (!form.title.trim()) {
      setError("제목을 입력하세요.");
      return;
    }
    if (!form.project_id) {
      setError("프로젝트를 선택하세요.");
      return;
    }
    if (form.category_ids.length === 0) {
      setError("카테고리를 선택하세요.");
      return;
    }
    if (isEmptyDoc(form.description)) {
      setError("내용을 입력하세요.");
      return;
    }

    createTicket.mutate({
      form: {
        title: form.title.trim(),
        description: form.description,
        category_ids: form.category_ids,
        work_type: form.work_type?.trim() || null,
        project_id: form.project_id ?? null,
      },
      files: attachments,
    });
  }

  // Auto-focus title input when step changes to title
  useEffect(() => {
    if (currentStep === "title" && titleInputRef.current) {
      setTimeout(() => titleInputRef.current?.focus(), 100);
    }
  }, [currentStep]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Enter" && e.metaKey && currentStep === "review") {
        handleSubmit();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [currentStep, form, attachments]);

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{
        backgroundColor: "var(--bg-page)",
      }}
    >
      {/* Progress Bar */}
      <div
        className="fixed top-0 left-0 right-0 h-1 z-50 transition-all duration-300"
        style={{
          background: "linear-gradient(90deg, var(--color-primary-500) 0%, var(--color-accent-500) 100%)",
          width: `${progress}%`,
        }}
      />

      {/* Main Content */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-12">
        <div className="w-full max-w-3xl">
          {/* Step Content */}
          <div className="min-h-[400px] animate-fadeIn">
            {currentStep === "welcome" && (
              <div className="space-y-8 text-center">
                <div className="space-y-4">
                  <div
                    className="inline-flex items-center justify-center w-20 h-20 rounded-2xl mb-4"
                    style={{
                      background: "linear-gradient(135deg, var(--color-primary-500) 0%, var(--color-accent-500) 100%)",
                    }}
                  >
                    <FileText className="w-10 h-10 text-white" />
                  </div>
                  <h1 className="text-5xl font-bold tracking-tight" style={{ color: "var(--text-primary)" }}>
                    새 요청 생성
                  </h1>
                  <p className="text-xl" style={{ color: "var(--text-secondary)" }}>
                    IT 서비스 요청을 간편하게 작성하세요
                  </p>
                </div>
                <button
                  onClick={nextStep}
                  className="inline-flex items-center gap-2 px-8 py-4 rounded-xl text-lg font-semibold text-white shadow-lg hover:shadow-xl transition-all transform hover:scale-105"
                  style={{
                    background: "linear-gradient(135deg, var(--color-primary-600) 0%, var(--color-primary-700) 100%)",
                  }}
                >
                  시작하기
                  <ArrowRight className="w-5 h-5" />
                </button>
              </div>
            )}

            {currentStep === "work_type" && (
              <div className="space-y-8">
                <div className="space-y-2">
                  <p className="text-sm font-medium" style={{ color: "var(--text-tertiary)" }}>
                    1단계 / 5단계
                  </p>
                  <h2 className="text-4xl font-bold" style={{ color: "var(--text-primary)" }}>
                    어떤 종류의 요청인가요?
                  </h2>
                  <p className="text-lg" style={{ color: "var(--text-secondary)" }}>
                    요청 유형을 선택해주세요
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {workTypeOptions.map((option) => {
                    const Icon = option.icon;
                    const isSelected = form.work_type === option.value;
                    return (
                      <button
                        key={option.value}
                        onClick={() => {
                          handleChange("work_type", option.value);
                          setTimeout(nextStep, 300);
                        }}
                        className="group relative p-6 rounded-2xl border-2 transition-all text-left"
                        style={{
                          borderColor: isSelected ? "var(--color-primary-500)" : "var(--border-default)",
                          backgroundColor: isSelected ? "var(--color-primary-50)" : "var(--bg-card)",
                          transform: isSelected ? "scale(1.02)" : "scale(1)",
                        }}
                        onMouseEnter={(e) => {
                          if (!isSelected) {
                            e.currentTarget.style.borderColor = "var(--color-primary-300)";
                            e.currentTarget.style.transform = "scale(1.02)";
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (!isSelected) {
                            e.currentTarget.style.borderColor = "var(--border-default)";
                            e.currentTarget.style.transform = "scale(1)";
                          }
                        }}
                      >
                        {isSelected && (
                          <div
                            className="absolute top-4 right-4"
                            style={{ color: "var(--color-primary-600)" }}
                          >
                            <CheckCircle2 className="w-6 h-6" />
                          </div>
                        )}
                        <div className="flex items-start gap-4">
                          <div
                            className="flex items-center justify-center w-12 h-12 rounded-xl flex-shrink-0"
                            style={{
                              backgroundColor: isSelected
                                ? "var(--color-primary-100)"
                                : "var(--bg-subtle)",
                              color: isSelected ? "var(--color-primary-700)" : "var(--text-secondary)",
                            }}
                          >
                            <Icon className="w-6 h-6" />
                          </div>
                          <div className="flex-1">
                            <h3
                              className="text-xl font-semibold mb-1"
                              style={{ color: "var(--text-primary)" }}
                            >
                              {option.label}
                            </h3>
                            <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
                              {option.description}
                            </p>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {currentStep === "title" && (
              <div className="space-y-8">
                <div className="space-y-2">
                  <p className="text-sm font-medium" style={{ color: "var(--text-tertiary)" }}>
                    2단계 / 5단계
                  </p>
                  <h2 className="text-4xl font-bold" style={{ color: "var(--text-primary)" }}>
                    요청 제목을 입력하세요
                  </h2>
                  <p className="text-lg" style={{ color: "var(--text-secondary)" }}>
                    간단하고 명확하게 작성해주세요
                  </p>
                </div>

                <div className="space-y-3">
                  <input
                    ref={titleInputRef}
                    type="text"
                    className="no-focus-ring w-full text-2xl font-medium px-6 py-4 rounded-xl border focus:outline-none focus:ring-0 transition-colors bg-transparent"
                    style={{
                      borderColor: form.title.trim() ? "var(--border-default)" : "var(--border-default)",
                      color: "var(--text-primary)",
                    }}
                    placeholder="예: 프린터 연결이 안 됩니다"
                    value={form.title}
                    onChange={(e) => handleChange("title", e.target.value)}
                    maxLength={200}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && canProceed()) {
                        nextStep();
                      }
                    }}
                  />
                  <div className="flex items-center justify-between">
                    <p className="text-sm" style={{ color: "var(--text-tertiary)" }}>
                      Enter를 눌러 다음 단계로 이동
                    </p>
                    <span className="text-sm" style={{ color: "var(--text-tertiary)" }}>
                      {form.title.length}/200
                    </span>
                  </div>
                </div>
              </div>
            )}

            {currentStep === "category" && (
              <div className="space-y-8">
                <div className="space-y-2">
                  <p className="text-sm font-medium" style={{ color: "var(--text-tertiary)" }}>
                    3단계 / 5단계
                  </p>
                  <h2 className="text-4xl font-bold" style={{ color: "var(--text-primary)" }}>
                    사업/요청카테고리를 선택하세요
                  </h2>
                  <p className="text-lg" style={{ color: "var(--text-secondary)" }}>
                    요청과 관련된 사업과 유형에 맞는 카테고리를 선택해주세요
                  </p>
                </div>

                <div className="space-y-6">
                  <div className="space-y-2">
                    <div className="text-sm font-medium" style={{ color: "var(--text-tertiary)" }}>
                      프로젝트 선택
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-3">

                    {projectLoading && (
                      <div className="rounded-xl border border-dashed px-4 py-3 text-sm" style={{ color: "var(--text-tertiary)" }}>
                        프로젝트를 불러오는 중...
                      </div>
                    )}
                    {projectError && (
                      <div className="rounded-xl border px-4 py-3 text-sm" style={{ color: "var(--color-danger-700)", borderColor: "var(--color-danger-200)", backgroundColor: "var(--color-danger-50)" }}>
                        {projectError}
                      </div>
                    )}

                    {activeProjects.map((p) => {
                      const isSelected = project?.id === p.id;
                      return (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => handleProjectSelect(p)}
                          className="group p-4 rounded-xl border-2 transition-all text-left flex items-center justify-between"
                          style={{
                            borderColor: isSelected ? "var(--color-primary-500)" : "var(--border-default)",
                            backgroundColor: isSelected ? "var(--color-primary-50)" : "var(--bg-card)",
                          }}
                        >
                          <div className="flex items-center gap-3">
                            {isSelected && (
                              <CheckCircle2 className="w-5 h-5" style={{ color: "var(--color-primary-600)" }} />
                            )}
                            <div>
                              <div className="text-base font-medium" style={{ color: "var(--text-primary)" }}>
                                [프로젝트] {p.name}
                              </div>
                              {(p.start_date || p.end_date) && (
                                <div className="text-xs" style={{ color: "var(--text-tertiary)" }}>
                                  {p.start_date ?? "-"} ~ {p.end_date ?? "-"}
                                </div>
                              )}
                            </div>
                          </div>
                          <ChevronRight className="w-5 h-5" style={{ color: "var(--text-tertiary)" }} />
                        </button>
                      );
                    })}
                  </div>

                  {project ? (
                    <div className="space-y-3">
                      <div className="text-sm font-medium" style={{ color: "var(--text-tertiary)" }}>
                        카테고리 (복수 선택 가능)
                      </div>
                      <div className="grid grid-cols-1 gap-3">
                        {sortedCategories.map((category) => {
                          const isSelected = form.category_ids.includes(category.id);
                          return (
                            <button
                              key={category.id}
                              type="button"
                              onClick={() => toggleCategory(category.id)}
                              className="group p-4 rounded-xl border-2 transition-all text-left flex items-center justify-between"
                              style={{
                                borderColor: isSelected ? "var(--color-primary-500)" : "var(--border-default)",
                                backgroundColor: isSelected ? "var(--color-primary-50)" : "var(--bg-card)",
                              }}
                              onMouseEnter={(e) => {
                                if (!isSelected) {
                                  e.currentTarget.style.borderColor = "var(--color-primary-300)";
                                  e.currentTarget.style.backgroundColor = "var(--bg-hover)";
                                }
                              }}
                              onMouseLeave={(e) => {
                                if (!isSelected) {
                                  e.currentTarget.style.borderColor = "var(--border-default)";
                                  e.currentTarget.style.backgroundColor = "var(--bg-card)";
                                }
                              }}
                            >
                              <div className="flex items-center gap-3">
                                {isSelected && (
                                  <CheckCircle2 className="w-5 h-5" style={{ color: "var(--color-primary-600)" }} />
                                )}
                                <span className="text-lg font-medium" style={{ color: "var(--text-primary)" }}>
                                  {category.name}
                                </span>
                              </div>
                              <ChevronRight className="w-5 h-5" style={{ color: "var(--text-tertiary)" }} />
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ) : (
                    <div
                      className="rounded-xl border px-4 py-3 text-sm"
                      style={{
                        backgroundColor: "var(--bg-subtle)",
                        borderColor: "var(--border-default)",
                        color: "var(--text-secondary)",
                      }}
                    >
                      프로젝트를 먼저 선택하면 카테고리를 고를 수 있습니다.
                    </div>
                  )}
                </div>
              </div>
            )}

            {currentStep === "description" && (
              <div className="space-y-8">
                <div className="space-y-2">
                  <p className="text-sm font-medium" style={{ color: "var(--text-tertiary)" }}>
                    4단계 / 5단계
                  </p>
                  <h2 className="text-4xl font-bold" style={{ color: "var(--text-primary)" }}>
                    요청 내용을 작성해주세요
                  </h2>
                  <p className="text-lg" style={{ color: "var(--text-secondary)" }}>
                    문제 상황이나 요청 사항을 자세히 설명해주세요
                  </p>
                </div>

                <div className="space-y-3">
                  <RichTextEditor
                    value={form.description}
                    onChange={(doc) => handleChange("description", doc)}
                    onError={setError}
                    placeholder="예: 3층 사무실에 있는 HP 프린터가 네트워크에 연결되지 않습니다. 어제까지는 정상 작동했는데..."
                    minHeight="280px"
                  />

                  <input
                    id="attachment-input"
                    type="file"
                    multiple
                    className="sr-only"
                    ref={fileInputRef}
                    onChange={(e) => {
                      addFiles(e.currentTarget.files);
                      e.currentTarget.value = "";
                    }}
                  />

                  <div
                    className="rounded-2xl border-2 border-dashed p-6 transition-all text-center cursor-pointer"
                    style={{
                      borderColor: dragActive ? "var(--color-primary-400)" : "var(--border-default)",
                      backgroundColor: dragActive ? "var(--color-primary-50)" : "var(--bg-card)",
                    }}
                    onDragOver={(e) => {
                      e.preventDefault();
                      setDragActive(true);
                    }}
                    onDragLeave={(e) => {
                      e.preventDefault();
                      setDragActive(false);
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      setDragActive(false);
                      addFiles(e.dataTransfer.files);
                    }}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Paperclip
                      className="w-8 h-8 mx-auto mb-2"
                      style={{ color: "var(--text-tertiary)" }}
                    />
                    <p className="text-base font-medium mb-1" style={{ color: "var(--text-primary)" }}>
                      첨부파일을 드래그하거나 클릭하여 선택
                    </p>
                    <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
                      파일당 최대 25MB
                    </p>
                  </div>

                  {attachments.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-sm font-medium" style={{ color: "var(--text-secondary)" }}>
                        첨부된 파일 ({attachments.length})
                      </p>
                      {attachments.map((file, idx) => (
                        <div
                          key={`${file.name}-${idx}`}
                          className="flex items-center justify-between p-4 rounded-xl border"
                          style={{
                            backgroundColor: "var(--bg-card)",
                            borderColor: "var(--border-default)",
                          }}
                        >
                          <div className="flex items-center gap-3">
                            <Paperclip className="w-5 h-5" style={{ color: "var(--text-tertiary)" }} />
                            <div>
                              <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                                {file.name}
                              </p>
                              <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>
                                {formatBytes(file.size)}
                              </p>
                            </div>
                          </div>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              removeFile(idx);
                            }}
                            className="p-2 rounded-lg transition-colors"
                            style={{ color: "var(--text-tertiary)" }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.backgroundColor = "var(--bg-hover)";
                              e.currentTarget.style.color = "var(--color-danger-600)";
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.backgroundColor = "transparent";
                              e.currentTarget.style.color = "var(--text-tertiary)";
                            }}
                          >
                            <X className="w-5 h-5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {currentStep === "review" && (
              <div className="space-y-8">
                <div className="space-y-2">
                  <p className="text-sm font-medium" style={{ color: "var(--text-tertiary)" }}>
                    5단계 / 5단계
                  </p>
                  <h2 className="text-4xl font-bold" style={{ color: "var(--text-primary)" }}>
                    입력 내용을 확인하세요
                  </h2>
                  <p className="text-lg" style={{ color: "var(--text-secondary)" }}>
                    모든 정보가 정확한지 확인 후 제출해주세요
                  </p>
                </div>

                <div
                  className="rounded-2xl border p-6 space-y-6"
                  style={{
                    backgroundColor: "var(--bg-card)",
                    borderColor: "var(--border-default)",
                  }}
                >
                  <div className="space-y-4">
                    <div>
                      <p className="text-sm font-medium mb-2" style={{ color: "var(--text-tertiary)" }}>
                        작업 구분
                      </p>
                      <p className="text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
                        {workTypeOptions.find((w) => w.value === form.work_type)?.label}
                      </p>
                    </div>

                    <div className="h-px" style={{ backgroundColor: "var(--border-subtle)" }} />

                    <div>
                      <p className="text-sm font-medium mb-2" style={{ color: "var(--text-tertiary)" }}>
                        제목
                      </p>
                      <p className="text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
                        {form.title}
                      </p>
                    </div>

                    <div className="h-px" style={{ backgroundColor: "var(--border-subtle)" }} />

                    <div>
                      <p className="text-sm font-medium mb-2" style={{ color: "var(--text-tertiary)" }}>
                        카테고리
                      </p>
                      <p className="text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
                        {form.category_ids
                          .map((id) => categories.find((c) => c.id === id)?.name)
                          .filter(Boolean)
                          .join(", ")}
                      </p>
                    </div>

                    {project && (
                      <>
                        <div className="h-px" style={{ backgroundColor: "var(--border-subtle)" }} />
                        <div>
                          <p className="text-sm font-medium mb-2" style={{ color: "var(--text-tertiary)" }}>
                            프로젝트
                          </p>
                          <p className="text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
                            [프로젝트] {project.name}
                          </p>
                        </div>
                      </>
                    )}

                    {attachments.length > 0 && (
                      <>
                        <div className="h-px" style={{ backgroundColor: "var(--border-subtle)" }} />
                        <div>
                          <p className="text-sm font-medium mb-2" style={{ color: "var(--text-tertiary)" }}>
                            첨부파일
                          </p>
                          <p className="text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
                            {attachments.length}개 파일
                          </p>
                        </div>
                      </>
                    )}
                  </div>
                </div>

                {error && (
                  <div
                    className="rounded-xl border px-4 py-3 text-sm"
                    style={{
                      backgroundColor: "var(--color-danger-50)",
                      borderColor: "var(--color-danger-200)",
                      color: "var(--color-danger-700)",
                    }}
                  >
                    {error}
                  </div>
                )}

                <button
                  onClick={handleSubmit}
                  disabled={createTicket.isPending}
                  className="w-full py-4 rounded-xl text-lg font-semibold text-white shadow-lg hover:shadow-xl transition-all transform hover:scale-[1.02] disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{
                    background: "linear-gradient(135deg, var(--color-primary-600) 0%, var(--color-primary-700) 100%)",
                  }}
                >
                  {createTicket.isPending ? "제출 중..." : "요청 제출하기"}
                </button>

                <p className="text-center text-sm" style={{ color: "var(--text-tertiary)" }}>
                  제출 후에는 수정이 불가능합니다.
                </p>
              </div>
            )}
          </div>

          {/* Navigation Buttons */}
          {currentStep !== "welcome" && (
            <div className="flex items-center justify-between mt-12 gap-4">
              <button
                onClick={prevStep}
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl font-medium transition-all"
                style={{
                  backgroundColor: "var(--bg-card)",
                  borderColor: "var(--border-default)",
                  color: "var(--text-secondary)",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = "var(--bg-hover)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = "var(--bg-card)";
                }}
              >
                <ArrowLeft className="w-5 h-5" />
                이전
              </button>

              {currentStep !== "review" && (
                <button
                  onClick={nextStep}
                  disabled={!canProceed()}
                  className="inline-flex items-center gap-2 px-6 py-3 rounded-xl font-medium text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{
                    background: "linear-gradient(135deg, var(--color-primary-600) 0%, var(--color-primary-700) 100%)",
                  }}
                >
                  다음
                  <ArrowRight className="w-5 h-5" />
                </button>
              )}
            </div>
          )}

          {/* Progress Indicator */}
          <div className="mt-8 text-center">
            <p className="text-sm" style={{ color: "var(--text-tertiary)" }}>
              {currentStepIndex + 1} / {steps.length}
            </p>
          </div>
        </div>
      </div>

    </div>
  );
}

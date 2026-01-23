"use client";

import type { ReactNode } from "react";

type PageHeaderProps = {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  meta?: ReactNode;
  actions?: ReactNode;
  icon?: string;
};

export default function PageHeader({ eyebrow, title, subtitle, meta, actions, icon }: PageHeaderProps) {
  return (
    <div
      className="rounded-2xl border p-6 mb-6 transition-colors"
      style={{
        backgroundColor: "var(--bg-card)",
        borderColor: "var(--border-default)",
        boxShadow: "var(--shadow-sm)",
      }}
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-4 min-w-0 flex-1">
          {icon && (
            <div
              className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-xl text-3xl"
              style={{
                backgroundColor: "var(--color-primary-100)",
                color: "var(--color-primary-700)",
              }}
            >
              {icon}
            </div>
          )}
          <div className="min-w-0 flex-1">
            {eyebrow && (
              <div
                className="mb-2 inline-flex items-center gap-2 rounded-full px-3 py-1 border"
                style={{
                  backgroundColor: "var(--color-primary-100)",
                  borderColor: "var(--color-primary-200)",
                }}
              >
                <div className="h-1.5 w-1.5 rounded-full animate-pulse" style={{ backgroundColor: "var(--color-primary-600)" }} />
                <span className="text-xs font-bold uppercase tracking-wider" style={{ color: "var(--color-primary-700)" }}>
                  {eyebrow}
                </span>
              </div>
            )}
            <h1 className="text-3xl font-bold tracking-tight" style={{ color: "var(--text-primary)" }}>
              {title}
            </h1>
            {subtitle && (
              <p className="mt-2 text-base" style={{ color: "var(--text-secondary)" }}>
                {subtitle}
              </p>
            )}
            {meta && (
              <div className="mt-3 text-sm" style={{ color: "var(--text-secondary)" }}>
                {meta}
              </div>
            )}
          </div>
        </div>
        {actions && <div className="flex items-center gap-2 flex-shrink-0">{actions}</div>}
      </div>
    </div>
  );
}

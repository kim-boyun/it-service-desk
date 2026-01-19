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
    <div className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm mb-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-4 min-w-0 flex-1">
          {icon && (
            <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-xl bg-primary-50 text-3xl">
              {icon}
            </div>
          )}
          <div className="min-w-0 flex-1">
            {eyebrow && (
              <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-primary-50 px-3 py-1 border border-primary-200">
                <div className="h-1.5 w-1.5 rounded-full bg-primary-500 animate-pulse" />
                <span className="text-xs font-bold uppercase tracking-wider text-primary-700">
                  {eyebrow}
                </span>
              </div>
            )}
            <h1 className="text-3xl font-bold text-neutral-900 tracking-tight">{title}</h1>
            {subtitle && <p className="mt-2 text-base text-neutral-600">{subtitle}</p>}
            {meta && <div className="mt-3 text-sm text-neutral-600">{meta}</div>}
          </div>
        </div>
        {actions && (
          <div className="flex items-center gap-2 flex-shrink-0">{actions}</div>
        )}
      </div>
    </div>
  );
}

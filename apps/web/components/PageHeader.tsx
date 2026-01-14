"use client";

import type { ReactNode } from "react";

type PageHeaderProps = {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  meta?: ReactNode;
  actions?: ReactNode;
};

export default function PageHeader({ eyebrow, title, subtitle, meta, actions }: PageHeaderProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4 pb-5 border-b border-neutral-200">
      <div className="min-w-0 flex-1">
        {eyebrow && (
          <div className="text-xs font-semibold uppercase tracking-wider text-neutral-500 mb-1">
            {eyebrow}
          </div>
        )}
        <h1 className="text-2xl font-bold text-neutral-900">{title}</h1>
        {subtitle && <p className="mt-1.5 text-sm text-neutral-600">{subtitle}</p>}
        {meta && <div className="mt-2 text-sm text-neutral-600">{meta}</div>}
      </div>
      {actions && <div className="flex items-center gap-2 flex-shrink-0">{actions}</div>}
    </div>
  );
}

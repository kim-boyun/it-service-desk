/**
 * Badge Component - Enhanced Version
 * Professional badge with dark mode support
 */

import { HTMLAttributes } from "react";

type BadgeVariant = "default" | "primary" | "success" | "warning" | "danger" | "info" | "neutral";
type BadgeSize = "sm" | "md" | "lg";

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
  size?: BadgeSize;
  dot?: boolean;
}

const variantStyles: Record<BadgeVariant, string> = {
  default:
    "bg-[var(--bg-muted)] text-[var(--text-secondary)] border border-[var(--border-default)]",
  primary:
    "bg-[var(--color-primary-100)] text-[var(--color-primary-700)] border border-[var(--color-primary-200)] dark:bg-[var(--color-primary-900)] dark:text-[var(--color-primary-300)] dark:border-[var(--color-primary-800)]",
  success:
    "bg-[var(--color-success-100)] text-[var(--color-success-700)] border border-[var(--color-success-200)]",
  warning:
    "bg-[var(--color-warning-100)] text-[var(--color-warning-700)] border border-[var(--color-warning-200)]",
  danger:
    "bg-[var(--color-danger-100)] text-[var(--color-danger-700)] border border-[var(--color-danger-200)]",
  info:
    "bg-[var(--color-info-100)] text-[var(--color-info-700)] border border-[var(--color-info-200)]",
  neutral:
    "bg-[var(--color-neutral-100)] text-[var(--color-neutral-700)] border border-[var(--color-neutral-200)]",
};

const sizeStyles: Record<BadgeSize, string> = {
  sm: "px-2 py-0.5 text-xs",
  md: "px-2.5 py-1 text-sm",
  lg: "px-3 py-1.5 text-sm",
};

const dotColors: Record<BadgeVariant, string> = {
  default: "bg-[var(--text-secondary)]",
  primary: "bg-[var(--color-primary-600)]",
  success: "bg-[var(--color-success-600)]",
  warning: "bg-[var(--color-warning-600)]",
  danger: "bg-[var(--color-danger-600)]",
  info: "bg-[var(--color-info-600)]",
  neutral: "bg-[var(--color-neutral-600)]",
};

export function Badge({
  children,
  variant = "default",
  size = "sm",
  dot = false,
  className = "",
  ...props
}: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 font-medium rounded-full transition-colors ${variantStyles[variant]} ${sizeStyles[size]} ${className}`}
      {...props}
    >
      {dot && <span className={`w-1.5 h-1.5 rounded-full ${dotColors[variant]}`} />}
      {children}
    </span>
  );
}

/**
 * StatCard 2.0 - Professional Dashboard Statistics Card
 * Features: Large numbers, trend indicators, gradient backgrounds, icons
 */

import { ReactNode } from "react";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

interface StatCardProps {
  title: string;
  value: number | string;
  subtitle?: string;
  trend?: {
    value: number;
    label?: string;
  };
  icon?: ReactNode;
  variant?: "primary" | "success" | "warning" | "danger" | "info" | "accent";
  loading?: boolean;
}

const variantStyles = {
  primary: {
    gradient: "linear-gradient(135deg, #10b981 0%, #059669 100%)",
    bgLight: "var(--color-primary-50)",
    textColor: "var(--color-primary-700)",
    iconBg: "var(--color-primary-100)",
  },
  success: {
    gradient: "linear-gradient(135deg, #22c55e 0%, #16a34a 100%)",
    bgLight: "var(--color-success-50)",
    textColor: "var(--color-success-700)",
    iconBg: "var(--color-success-100)",
  },
  warning: {
    gradient: "linear-gradient(135deg, #f59e0b 0%, #d97706 100%)",
    bgLight: "var(--color-warning-50)",
    textColor: "var(--color-warning-700)",
    iconBg: "var(--color-warning-100)",
  },
  danger: {
    gradient: "linear-gradient(135deg, #ef4444 0%, #dc2626 100%)",
    bgLight: "var(--color-danger-50)",
    textColor: "var(--color-danger-700)",
    iconBg: "var(--color-danger-100)",
  },
  info: {
    gradient: "linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)",
    bgLight: "var(--color-info-50)",
    textColor: "var(--color-info-700)",
    iconBg: "var(--color-info-100)",
  },
  accent: {
    gradient: "linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)",
    bgLight: "var(--color-accent-50)",
    textColor: "var(--color-accent-700)",
    iconBg: "var(--color-accent-100)",
  },
};

function TrendIndicator({ value, label }: { value: number; label?: string }) {
  const isPositive = value > 0;
  const isNeutral = value === 0;

  return (
    <div className="flex items-center gap-1.5 text-sm">
      {isNeutral ? (
        <Minus className="w-4 h-4" style={{ color: "var(--text-tertiary)" }} />
      ) : isPositive ? (
        <TrendingUp className="w-4 h-4" style={{ color: "var(--color-success-600)" }} />
      ) : (
        <TrendingDown className="w-4 h-4" style={{ color: "var(--color-danger-600)" }} />
      )}
      <span
        className="font-semibold"
        style={{
          color: isNeutral
            ? "var(--text-tertiary)"
            : isPositive
            ? "var(--color-success-600)"
            : "var(--color-danger-600)",
        }}
      >
        {isPositive && "+"}
        {value}%
      </span>
      {label && <span style={{ color: "var(--text-secondary)" }}>{label}</span>}
    </div>
  );
}

export default function StatCard({
  title,
  value,
  subtitle,
  trend,
  icon,
  variant = "primary",
  loading = false,
}: StatCardProps) {
  const styles = variantStyles[variant];

  return (
    <div
      className="relative overflow-hidden rounded-2xl border transition-all duration-300 hover:shadow-lg hover:scale-[1.02]"
      style={{
        backgroundColor: "var(--bg-card)",
        borderColor: "var(--border-default)",
      }}
    >
      {/* Gradient Accent Bar */}
      <div className="absolute top-0 left-0 right-0 h-1" style={{ background: styles.gradient }} />

      <div className="p-6">
        {/* Header with Icon */}
        <div className="flex items-start justify-between mb-4">
          <div>
            <p className="text-sm font-medium uppercase tracking-wide" style={{ color: "var(--text-secondary)" }}>
              {title}
            </p>
          </div>
          {icon && (
            <div
              className="flex items-center justify-center w-12 h-12 rounded-xl"
              style={{
                backgroundColor: styles.bgLight,
                color: styles.textColor,
              }}
            >
              {icon}
            </div>
          )}
        </div>

        {/* Main Value */}
        <div className="mb-3">
          {loading ? (
            <div className="h-12 w-32 animate-pulse rounded-lg" style={{ backgroundColor: "var(--bg-muted)" }} />
          ) : (
            <div className="text-4xl font-bold tracking-tight" style={{ color: "var(--text-primary)" }}>
              {typeof value === "number" ? value.toLocaleString() : value}
            </div>
          )}
        </div>

        {/* Footer with Trend & Subtitle */}
        <div className="flex items-center justify-between">
          {trend && <TrendIndicator value={trend.value} label={trend.label} />}
          {subtitle && !trend && (
            <p className="text-sm" style={{ color: "var(--text-tertiary)" }}>
              {subtitle}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

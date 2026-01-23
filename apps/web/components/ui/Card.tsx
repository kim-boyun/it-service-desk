/**
 * Card Components - Enhanced Version
 * Professional card with dark mode support
 */

import { ReactNode, HTMLAttributes } from "react";

type CardPadding = "none" | "sm" | "md" | "lg";

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  padding?: CardPadding;
  hover?: boolean;
}

interface CardHeaderProps {
  title?: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  className?: string;
  children?: ReactNode;
}

interface CardBodyProps extends HTMLAttributes<HTMLDivElement> {
  padding?: CardPadding;
}

interface CardFooterProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
}

const paddingStyles: Record<CardPadding, string> = {
  none: "",
  sm: "p-4",
  md: "p-5",
  lg: "p-6",
};

export function Card({ children, padding = "md", hover = false, className = "", ...props }: CardProps) {
  return (
    <div
      className={`rounded-xl border transition-all duration-200 ${paddingStyles[padding]} ${
        hover ? "hover:shadow-lg hover:scale-[1.01]" : "shadow-sm"
      } ${className}`}
      style={{
        backgroundColor: "var(--bg-card)",
        borderColor: "var(--border-default)",
      }}
      {...props}
    >
      {children}
    </div>
  );
}

export function CardHeader({ title, subtitle, actions, className = "", children }: CardHeaderProps) {
  if (children) {
    return (
      <div
        className={`flex items-center justify-between gap-4 pb-4 border-b ${className}`}
        style={{ borderColor: "var(--border-default)" }}
      >
        {children}
      </div>
    );
  }

  return (
    <div
      className={`flex items-center justify-between gap-4 pb-4 border-b ${className}`}
      style={{ borderColor: "var(--border-default)" }}
    >
      <div className="min-w-0 flex-1">
        <h3 className="text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
          {title}
        </h3>
        {subtitle && (
          <p className="mt-1 text-sm" style={{ color: "var(--text-secondary)" }}>
            {subtitle}
          </p>
        )}
      </div>
      {actions && <div className="flex items-center gap-2 flex-shrink-0">{actions}</div>}
    </div>
  );
}

export function CardBody({ children, padding = "none", className = "", ...props }: CardBodyProps) {
  return (
    <div className={`${padding !== "none" ? paddingStyles[padding] : ""} ${className}`} {...props}>
      {children}
    </div>
  );
}

export function CardFooter({ children, className = "", ...props }: CardFooterProps) {
  return (
    <div
      className={`pt-4 mt-4 border-t ${className}`}
      style={{ borderColor: "var(--border-default)" }}
      {...props}
    >
      {children}
    </div>
  );
}

/**
 * Input Component
 * 일관된 입력 필드 스타일
 */

import { forwardRef, InputHTMLAttributes } from "react";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
  fullWidth?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  (
    {
      label,
      error,
      helperText,
      fullWidth = false,
      className = "",
      id,
      required,
      style: styleProp,
      ...restProps
    },
    ref
  ) => {
    const inputId = id || label?.toLowerCase().replace(/\s+/g, "-");
    const widthStyles = fullWidth ? "w-full" : "";

    return (
      <div className={`${widthStyles}`}>
        {label && (
          <label
            htmlFor={inputId}
            className="block text-sm font-medium mb-1.5"
            style={{ color: "var(--text-primary)" }}
          >
            {label}
            {required && <span className="text-danger-500 ml-1">*</span>}
          </label>
        )}
        <input
          ref={ref}
          id={inputId}
          required={required}
          className={`
            block w-full px-3 py-2 text-sm border rounded-lg
            transition-colors duration-200
            focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent
            disabled:cursor-not-allowed
            ${error ? "border-danger-500 focus:ring-danger-500" : ""}
            ${className}
          `}
          style={{
            backgroundColor: "var(--bg-input)",
            color: "var(--text-primary)",
            borderColor: error ? undefined : "var(--border-default)",
            ...styleProp,
          }}
          aria-invalid={error ? "true" : "false"}
          aria-describedby={error ? `${inputId}-error` : helperText ? `${inputId}-helper` : undefined}
          {...restProps}
        />
        {error && (
          <p id={`${inputId}-error`} className="mt-1.5 text-xs text-danger-600">
            {error}
          </p>
        )}
        {helperText && !error && (
          <p id={`${inputId}-helper`} className="mt-1.5 text-xs" style={{ color: "var(--text-tertiary)" }}>
            {helperText}
          </p>
        )}
      </div>
    );
  }
);

Input.displayName = "Input";

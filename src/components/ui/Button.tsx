import { ButtonHTMLAttributes } from "react";
import clsx from "clsx";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "danger" | "ghost";
  loading?: boolean;
  fullWidth?: boolean;
}

export default function Button({
  children,
  variant = "primary",
  loading = false,
  fullWidth = false,
  className,
  disabled,
  style,
  ...props
}: ButtonProps) {
  const isPrimary = variant === "primary";
  return (
    <button
      disabled={disabled || loading}
      className={clsx(
        "paper-button flex items-center justify-center gap-2 px-4 py-2.5 font-medium text-sm transition-all duration-200",
        fullWidth && "w-full",
        isPrimary   && "text-white hover:brightness-110 active:scale-[0.97] disabled:opacity-50",
        variant === "secondary" && "bg-white text-slate-700 border border-[rgba(48,52,59,0.12)] hover:bg-[#f5f0e8] active:scale-[0.97] disabled:opacity-50",
        variant === "danger"    && "bg-red-500 text-white hover:bg-red-600 active:scale-[0.97] disabled:opacity-50",
        variant === "ghost"     && "bg-transparent hover:bg-[rgba(14,51,38,0.06)] active:scale-[0.97] disabled:opacity-50",
        className
      )}
      style={isPrimary ? { background: "linear-gradient(135deg, #c69c48, #b07f28)", borderRadius: 16, ...style } : style}
      {...props}
    >
      {loading ? (
        <span className={clsx(
          "w-4 h-4 border-2 border-t-transparent rounded-full animate-spin",
          isPrimary ? "border-white/30 border-t-white" : "border-slate-300 border-t-slate-600"
        )} />
      ) : children}
    </button>
  );
}

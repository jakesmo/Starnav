import { cn } from "../../lib/utils";

const variants = {
  primary: "bg-accent hover:bg-accent-hover text-white",
  danger: "bg-error hover:bg-error/80 text-white",
  secondary: "bg-border hover:bg-border/80 text-text-primary",
  warning: "bg-warning hover:bg-warning/80 text-black",
  ghost: "bg-border/30 hover:bg-border/50 text-text-primary",
} as const;

const sizes = {
  sm: "px-3 py-1 text-xs",
  md: "px-3.5 py-1.5 text-sm",
  lg: "px-6 py-2.5 text-base",
} as const;

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: keyof typeof variants;
  size?: keyof typeof sizes;
  loading?: boolean;
}

export default function Button({
  variant = "primary",
  size = "md",
  loading = false,
  disabled,
  className,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(
        "rounded-md font-medium transition-colors inline-flex items-center justify-center gap-1.5",
        "disabled:opacity-45 disabled:cursor-not-allowed",
        variants[variant],
        sizes[size],
        className,
      )}
      disabled={disabled || loading}
      {...props}
    >
      {loading && (
        <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-[spin_0.8s_linear_infinite]" />
      )}
      {children}
    </button>
  );
}

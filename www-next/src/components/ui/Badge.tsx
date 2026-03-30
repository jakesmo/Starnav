import type { ReactNode } from "react";
import { cn } from "../../lib/utils";

interface BadgeProps {
  variant?: "live" | "sending" | "next" | "error";
  children: ReactNode;
}

const variantClasses: Record<NonNullable<BadgeProps["variant"]>, string> = {
  live: "bg-success/20 text-success",
  sending: "bg-send/20 text-send",
  next: "bg-accent/20 text-accent",
  error: "bg-error/20 text-error",
};

export default function Badge({ variant = "live", children }: BadgeProps) {
  return (
    <span
      className={cn(
        "text-[0.65rem] px-2 py-0.5 rounded-full font-semibold",
        variantClasses[variant],
      )}
    >
      {children}
    </span>
  );
}

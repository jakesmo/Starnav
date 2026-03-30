import type { ReactNode } from "react";

interface CardProps {
  title: string;
  badge?: ReactNode;
  children: ReactNode;
}

export default function Card({ title, badge, children }: CardProps) {
  return (
    <div className="bg-bg-card border border-border rounded-xl p-4">
      <div className="flex items-center gap-2 mb-3">
        <h2 className="uppercase text-xs tracking-wider text-text-secondary font-semibold">
          {title}
        </h2>
        {badge}
      </div>
      {children}
    </div>
  );
}

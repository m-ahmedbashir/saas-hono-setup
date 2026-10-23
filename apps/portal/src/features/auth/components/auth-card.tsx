import type { ReactNode } from "react";

/** The centered card the single-purpose auth pages share (same shell as accept-invite). */
export function AuthCard({
  title,
  description,
  children,
}: {
  title: string;
  description?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="bg-card w-full max-w-md space-y-6 rounded-xl border p-8">
      <div className="space-y-1.5">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="text-muted-foreground text-sm">{description}</p>}
      </div>
      {children}
    </div>
  );
}

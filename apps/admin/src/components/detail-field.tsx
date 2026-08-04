interface DetailFieldProps {
  label: string;
  value: string | null;
  capitalize?: boolean;
  mono?: boolean;
  link?: boolean;
}

// Shared label/value pair for detail-page sections (organizations, individuals, ...)
// — one place for the "—" empty fallback and truncation rules instead of repeating
// them per feature.
export function DetailField({ label, value, capitalize, mono, link }: DetailFieldProps) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd
        className={`truncate text-sm ${capitalize ? "capitalize" : ""} ${mono ? "font-mono text-xs" : ""}`}
      >
        {value ? (
          link ? (
            <a
              href={value}
              target="_blank"
              rel="noreferrer"
              className="text-primary hover:underline focus-visible:ring-ring focus-visible:ring-2 focus-visible:ring-offset-2"
            >
              {value}
            </a>
          ) : (
            value
          )
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </dd>
    </div>
  );
}

import { ReactNode } from "react";
import clsx from "clsx";

export function OptionCard(props: {
  selected: boolean;
  icon?: string;
  label: string;
  desc: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      className={clsx(
        "group rounded-2xl border p-4 text-left transition-all duration-150 active:scale-[0.98]",
        props.selected
          ? "border-primary bg-primary/5 shadow-card ring-2 ring-primary/20"
          : "border-slate-200 bg-white/70 hover:border-primary/50 hover:shadow-card"
      )}
    >
      <div className="flex items-center gap-2">
        {props.icon && <span className="text-xl">{props.icon}</span>}
        <span className={clsx("font-semibold text-sm", props.selected ? "text-primary" : "text-slate-800")}>
          {props.label}
        </span>
        {props.selected && <span className="ml-auto text-primary text-sm">✓</span>}
      </div>
      <p className="mt-1.5 text-xs text-slate-500 leading-relaxed">{props.desc}</p>
    </button>
  );
}

const PILL_STYLES: Record<string, string> = {
  ok: "bg-emerald-50 text-emerald-700 border-emerald-200",
  warn: "bg-amber-50 text-amber-700 border-amber-200",
  bad: "bg-rose-50 text-rose-700 border-rose-200",
  info: "bg-sky-50 text-sky-700 border-sky-200",
  muted: "bg-slate-100 text-slate-500 border-slate-200"
};

export function Pill(props: { tone: keyof typeof PILL_STYLES; children: ReactNode; title?: string }) {
  return (
    <span
      title={props.title}
      className={clsx(
        "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium whitespace-nowrap",
        PILL_STYLES[props.tone]
      )}
    >
      {props.children}
    </span>
  );
}

export function FieldLabel(props: { children: ReactNode; hint?: string }) {
  return (
    <div className="mb-2 flex items-baseline gap-2">
      <h4 className="text-sm font-semibold text-slate-800">{props.children}</h4>
      {props.hint && <span className="text-xs text-slate-400">{props.hint}</span>}
    </div>
  );
}

export const formatBytes = (n: number) => {
  if (n >= 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  if (n >= 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${n} B`;
};

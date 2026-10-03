import clsx from "clsx";

const steps = [
  { id: 1, label: "创意设定", hint: "类型 / 受众 / 时长 / 画幅" },
  { id: 2, label: "素材与附件", hint: "参考链接 · 附件状态" },
  { id: 3, label: "权限与创建", hint: "授权确认 · 幂等提交" }
];

export default function Stepper({ current }: { current: number }) {
  return (
    <ol className="flex items-center gap-2 md:gap-4">
      {steps.map((step, index) => {
        const done = current > step.id;
        const active = current === step.id;
        return (
          <li key={step.id} className="flex flex-1 items-center gap-2 md:gap-4">
            <div
              className={clsx(
                "flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold transition-all",
                done && "bg-emerald-500 text-white",
                active && "bg-gradient-to-br from-primary to-accent text-white shadow-card scale-110",
                !done && !active && "bg-slate-100 text-slate-400"
              )}
            >
              {done ? "✓" : step.id}
            </div>
            <div className="min-w-0">
              <p className={clsx("truncate text-sm font-semibold", active ? "text-slate-900" : done ? "text-emerald-700" : "text-slate-400")}>
                {step.label}
              </p>
              <p className="hidden md:block truncate text-xs text-slate-400">{step.hint}</p>
            </div>
            {index < steps.length - 1 && <div className={clsx("h-px flex-1", done ? "bg-emerald-300" : "bg-slate-200")} />}
          </li>
        );
      })}
    </ol>
  );
}

import { ASPECT_RATIOS, AUDIENCES, CONTENT_TYPES, DURATION_PRESETS, type WizardDraft } from "@/types/studio";
import { Card, Field, TextArea, TextInput } from "@/components/studio/ui";
import clsx from "clsx";

export default function StepBasic({
  draft,
  patch,
  errors
}: {
  draft: WizardDraft;
  patch: (partial: Partial<WizardDraft>) => void;
  errors: Record<string, string>;
}) {
  return (
    <div className="space-y-5">
      <Card>
        <div className="space-y-5">
          <Field label="作品标题" hint={`${draft.title.length}/80`} error={errors.title}>
            <TextInput
              value={draft.title}
              maxLength={80}
              placeholder="例如：云溪夜巡 · 湖畔光影 30 秒"
              invalid={Boolean(errors.title)}
              onChange={(e) => patch({ title: e.target.value })}
            />
          </Field>
          <Field label="创作备注" hint="可选">
            <TextArea
              value={draft.brief}
              maxLength={2000}
              placeholder="想表达的情绪、关键镜头或发布语境…"
              onChange={(e) => patch({ brief: e.target.value })}
            />
          </Field>
        </div>
      </Card>

      <Card>
        <h3 className="text-sm font-semibold text-slate-800">内容类型</h3>
        <div className="mt-3 grid grid-cols-2 md:grid-cols-5 gap-3">
          {CONTENT_TYPES.map((item) => (
            <button
              type="button"
              key={item.value}
              onClick={() => patch({ contentType: item.value })}
              className={clsx(
                "rounded-2xl border p-4 text-center transition-all hover:-translate-y-0.5",
                draft.contentType === item.value
                  ? "border-primary bg-primary/5 shadow-card ring-2 ring-primary/20"
                  : "border-slate-200 bg-white hover:border-primary/40"
              )}
            >
              <div className="text-2xl">{item.icon}</div>
              <div className={clsx("mt-1.5 text-sm font-semibold", draft.contentType === item.value ? "text-primary" : "text-slate-700")}>
                {item.label}
              </div>
            </button>
          ))}
        </div>
      </Card>

      <div className="grid md:grid-cols-2 gap-5">
        <Card>
          <h3 className="text-sm font-semibold text-slate-800">目标受众</h3>
          <div className="mt-3 flex flex-wrap gap-2">
            {AUDIENCES.map((item) => (
              <button
                type="button"
                key={item.value}
                onClick={() => patch({ audience: item.value })}
                className={clsx(
                  "rounded-full px-4 py-2 text-sm font-medium transition",
                  draft.audience === item.value
                    ? "bg-gradient-to-r from-primary to-accent text-white shadow-card"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                )}
              >
                {item.label}
              </button>
            ))}
          </div>
        </Card>

        <Card>
          <h3 className="text-sm font-semibold text-slate-800">目标时长</h3>
          <div className="mt-3 flex flex-wrap gap-2">
            {DURATION_PRESETS.map((sec) => (
              <button
                type="button"
                key={sec}
                onClick={() => patch({ durationSec: sec })}
                className={clsx(
                  "rounded-full px-4 py-2 text-sm font-medium transition",
                  draft.durationSec === sec
                    ? "bg-gradient-to-r from-primary to-accent text-white shadow-card"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                )}
              >
                {sec < 60 ? `${sec} 秒` : `${sec / 60} 分钟`}
              </button>
            ))}
          </div>
          <div className="mt-4 flex items-center gap-3">
            <input
              type="range"
              min={5}
              max={900}
              step={5}
              value={draft.durationSec}
              onChange={(e) => patch({ durationSec: Number(e.target.value) })}
              className="flex-1 accent-[#165dff]"
            />
            <span className="w-16 text-right text-sm font-semibold text-slate-700">{draft.durationSec}s</span>
          </div>
        </Card>
      </div>

      <Card>
        <h3 className="text-sm font-semibold text-slate-800">画幅比例</h3>
        <div className="mt-3 grid grid-cols-2 md:grid-cols-5 gap-3">
          {ASPECT_RATIOS.map((item) => {
            const [w, h] = item.value.split(":").map(Number);
            return (
              <button
                type="button"
                key={item.value}
                onClick={() => patch({ aspectRatio: item.value })}
                className={clsx(
                  "rounded-2xl border p-4 text-left transition-all hover:-translate-y-0.5",
                  draft.aspectRatio === item.value
                    ? "border-primary bg-primary/5 shadow-card ring-2 ring-primary/20"
                    : "border-slate-200 bg-white hover:border-primary/40"
                )}
              >
                <div className="flex h-12 items-center justify-center">
                  <div
                    className={clsx(
                      "rounded-md border-2",
                      draft.aspectRatio === item.value ? "border-primary" : "border-slate-300"
                    )}
                    style={{
                      width: `${Math.min(48, (w / Math.max(w, h)) * 52)}px`,
                      height: `${Math.min(48, (h / Math.max(w, h)) * 52)}px`
                    }}
                  />
                </div>
                <div className="mt-2 text-sm font-semibold text-slate-800">{item.label}</div>
                <div className="text-xs text-slate-400">{item.hint}</div>
              </button>
            );
          })}
        </div>
      </Card>
    </div>
  );
}

import { useWizardStore } from "@/store/wizardStore";
import { CONTENT_TYPES, AUDIENCES, DURATIONS, ASPECTS } from "./options";
import { OptionCard, FieldLabel } from "./components";

const StepBasics = () => {
  const basics = useWizardStore((s) => s.basics);
  const updateBasics = useWizardStore((s) => s.updateBasics);

  return (
    <div className="space-y-7">
      <div>
        <FieldLabel hint="将展示在项目与冻结脚本摘要中">项目标题 *</FieldLabel>
        <input
          value={basics.title}
          onChange={(e) => updateBasics({ title: e.target.value })}
          maxLength={120}
          placeholder="例如：云溪之夏 · 城市微度假宣传片"
          className="w-full rounded-xl border border-slate-200 bg-white/80 px-4 py-2.5 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
        />
      </div>

      <div>
        <FieldLabel hint="决定脚本结构与节奏模板">内容类型 *</FieldLabel>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {CONTENT_TYPES.map((o) => (
            <OptionCard
              key={o.value}
              icon={o.icon}
              label={o.label}
              desc={o.desc}
              selected={basics.contentType === o.value}
              onClick={() => updateBasics({ contentType: o.value })}
            />
          ))}
        </div>
      </div>

      <div>
        <FieldLabel hint="影响文案语气与场景侧重">目标受众 *</FieldLabel>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {AUDIENCES.map((o) => (
            <OptionCard
              key={o.value}
              icon={o.icon}
              label={o.label}
              desc={o.desc}
              selected={basics.audience === o.value}
              onClick={() => updateBasics({ audience: o.value })}
            />
          ))}
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <div>
          <FieldLabel hint="成片目标时长">时长 *</FieldLabel>
          <div className="grid grid-cols-2 gap-3">
            {DURATIONS.map((o) => (
              <OptionCard
                key={o.value}
                label={o.label}
                desc={o.desc}
                selected={basics.durationSec === o.value}
                onClick={() => updateBasics({ durationSec: o.value })}
              />
            ))}
          </div>
        </div>
        <div>
          <FieldLabel hint="投放渠道决定画幅">画幅 *</FieldLabel>
          <div className="grid grid-cols-2 gap-3">
            {ASPECTS.map((o) => (
              <OptionCard
                key={o.value}
                label={o.label}
                desc={o.desc}
                selected={basics.aspectRatio === o.value}
                onClick={() => updateBasics({ aspectRatio: o.value })}
              />
            ))}
          </div>
        </div>
      </div>

      <div>
        <FieldLabel hint="选填，将写入冻结摘要">创意简报</FieldLabel>
        <textarea
          value={basics.brief}
          onChange={(e) => updateBasics({ brief: e.target.value })}
          maxLength={2000}
          rows={3}
          placeholder="核心卖点、必拍场景、禁忌事项…"
          className="w-full resize-y rounded-xl border border-slate-200 bg-white/80 px-4 py-2.5 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
        />
      </div>
    </div>
  );
};

export default StepBasics;

import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import Stepper from "@/components/studio/Stepper";
import { Button, Card } from "@/components/studio/ui";
import StepBasic from "./StepBasic";
import StepMaterials from "./StepMaterials";
import StepReview from "./StepReview";
import { useWizard } from "./useWizard";
import { wizardFormSchema } from "@/lib/wizardSchema";
import { validateReferenceUrl } from "@/lib/wizardSchema";

export default function CreateProject() {
  const [step, setStep] = useState(1);
  const wizard = useWizard();
  const { draft, patch, submit, online, canSubmit } = wizard;

  const formErrors = useMemo(() => {
    const result = wizardFormSchema.safeParse({
      title: draft.title,
      contentType: draft.contentType,
      audience: draft.audience,
      durationSec: draft.durationSec,
      aspectRatio: draft.aspectRatio,
      brief: draft.brief
    });
    if (result.success) return {};
    const map: Record<string, string> = {};
    for (const issue of result.error.issues) map[issue.path.join(".")] = issue.message;
    return map;
  }, [draft]);

  const goNext = () => {
    if (step === 1) {
      if (Object.keys(formErrors).length > 0) return;
    }
    if (step === 2) {
      const bad = draft.references.find((r) => validateReferenceUrl(r.url));
      if (bad) return;
    }
    setStep((s) => Math.min(3, s + 1));
  };

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-primary">Creative Studio</p>
          <h1 className="mt-1 text-2xl font-bold text-slate-900">全栈项目创建向导</h1>
          <p className="mt-1 text-sm text-slate-500">收集内容类型、受众、时长与画幅；事务化初始化项目，参考素材进入独立解析队列。</p>
        </div>
        <Link to="/studio" className="text-sm font-medium text-primary hover:underline">
          ← 我的项目
        </Link>
      </div>

      <Card className="!bg-white/70">
        <Stepper current={step} />
      </Card>

      {wizard.multiTabPeer && (
        <div className="rounded-2xl border border-violet-200 bg-violet-50 px-4 py-3 text-sm text-violet-800">
          🗂️ {wizard.multiTabPeer.sameDraft ? "同一草稿正在另一个标签页编辑" : "另一个标签页正在编辑不同草稿"}
          ：即使两边同时提交，服务端也会依据请求号保证只创建一个项目。
        </div>
      )}

      {step === 1 && <StepBasic draft={draft} patch={patch} errors={formErrors} />}
      {step === 2 && (
        <StepMaterials
          draft={draft}
          patch={patch}
          onAddFiles={wizard.addFiles}
          onRetryAttachment={wizard.retryAttachment}
          onRemoveAttachment={wizard.removeAttachment}
        />
      )}
      {step === 3 && (
        <StepReview
          draft={draft}
          submit={submit}
          online={online}
          canSubmit={canSubmit}
          onSubmit={wizard.submitDraft}
          onRotateId={wizard.rotateId}
        />
      )}

      <div className="flex items-center justify-between">
        <Button variant="ghost" onClick={() => setStep((s) => Math.max(1, s - 1))} disabled={step === 1}>
          上一步
        </Button>
        <div className="flex items-center gap-3">
          <Button variant="secondary" onClick={wizard.forgetLocal}>
            清除本机草稿
          </Button>
          {step < 3 && (
            <Button onClick={goNext} disabled={step === 1 && Object.keys(formErrors).length > 0}>
              下一步
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

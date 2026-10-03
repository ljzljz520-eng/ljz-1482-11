import { z } from "zod";

/** 前端 Zod 校验：与后端 DTO 规则保持一致，提交前先拦截非法输入 */
export const wizardFormSchema = z.object({
  title: z
    .string()
    .trim()
    .min(2, "标题至少需要 2 个字符")
    .max(80, "标题不能超过 80 个字符"),
  contentType: z.enum(["short_video", "vlog", "documentary", "promo", "tutorial"]),
  audience: z.enum(["general", "youth", "family", "professional", "tourist"]),
  durationSec: z.number().int().min(5, "时长至少 5 秒").max(14400, "时长不能超过 4 小时"),
  aspectRatio: z.enum(["16:9", "9:16", "1:1", "4:5", "21:9"]),
  brief: z.string().max(2000, "备注不能超过 2000 字").default("")
});

export type WizardFormValues = z.infer<typeof wizardFormSchema>;

export function validateReferenceUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return "仅支持 http/https 链接";
    if (!parsed.hostname.includes(".")) return "域名格式不完整";
    return null;
  } catch {
    return "链接格式不正确（请以 https:// 开头）";
  }
}

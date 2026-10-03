import { z } from "zod";

export const CONTENT_TYPES = ["short_video", "vlog", "documentary", "promo", "tutorial"] as const;
export const ASPECT_RATIOS = ["16:9", "9:16", "1:1", "4:5", "21:9"] as const;
export const AUDIENCES = ["general", "youth", "family", "professional", "tourist"] as const;

const referenceSchema = z.object({
  url: z.string().min(1).max(2048),
  label: z.string().max(120).nullish()
});

const attachmentRefSchema = z.object({
  stagingId: z.string().optional().default(""),
  fileName: z.string().min(1).max(255),
  sizeBytes: z.number().int().min(0)
});

// 创建载荷中仅允许“未暂存登记”的本机附件占位（服务端按 pending_local 处理）
const attachmentPayloadSchema = z.union([
  z.object({
    stagingId: z.string().min(1),
    fileName: z.string().min(1).max(255),
    sizeBytes: z.number().int().min(0)
  }),
  z.object({
    stagingId: z.string().max(0).optional(),
    fileName: z.string().min(1).max(255),
    sizeBytes: z.number().int().min(0)
  })
]);

export const createProjectSchema = z.object({
  clientRequestId: z
    .string()
    .min(8)
    .max(80)
    .regex(/^[a-zA-Z0-9_-]+$/, "clientRequestId 只能包含字母、数字、- 与 _"),
  title: z.string().trim().min(2, "标题至少 2 个字符").max(80),
  contentType: z.enum(CONTENT_TYPES),
  audience: z.enum(AUDIENCES),
  durationSec: z.number().int().min(5).max(14400),
  aspectRatio: z.enum(ASPECT_RATIOS),
  brief: z.string().max(2000).optional().default(""),
  references: z.array(referenceSchema).max(20).optional().default([]),
  attachments: z.array(attachmentPayloadSchema).max(10).optional().default([])
});

export type CreateProjectInput = z.infer<typeof createProjectSchema>;

export const loginSchema = z.object({
  username: z.string().trim().min(2).max(40),
  password: z.string().min(4).max(100)
});

export const addReferenceSchema = z.object({
  url: z.string().min(1).max(2048),
  label: z.string().max(120).nullish()
});

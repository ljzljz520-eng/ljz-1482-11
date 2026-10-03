import { sha256Hex } from "./crypto.js";

export interface ProjectPayload {
  title: string;
  contentType: string;
  audience: string;
  durationSec: number;
  aspectRatio: string;
  brief?: string | null;
  references?: Array<{ url: string; label?: string | null }>;
  attachments?: Array<{ fileName: string; sizeBytes: number }>;
}

/**
 * 规范化序列化：键排序、去空白差异，保证“同一份业务内容”在任意客户端/标签页
 * 序列化出的字节完全一致，从而得到相同的 payloadHash。
 * 注意：clientRequestId 不参与哈希——请求号是身份，不是内容。
 */
export function canonicalize(payload: ProjectPayload): string {
  const normalized = {
    title: payload.title.trim(),
    contentType: payload.contentType,
    audience: payload.audience.trim(),
    durationSec: Math.trunc(payload.durationSec),
    aspectRatio: payload.aspectRatio,
    brief: (payload.brief ?? "").trim(),
    references: [...(payload.references ?? [])]
      .map((r) => ({ url: r.url.trim(), label: (r.label ?? "").trim() }))
      .sort((a, b) => (a.url === b.url ? a.label.localeCompare(b.label) : a.url.localeCompare(b.url))),
    attachments: [...(payload.attachments ?? [])]
      .map((a) => ({ fileName: a.fileName.trim(), sizeBytes: Math.trunc(a.sizeBytes) }))
      .sort((a, b) => (a.fileName === b.fileName ? a.sizeBytes - b.sizeBytes : a.fileName.localeCompare(b.fileName)))
  };
  return JSON.stringify(normalized);
}

export function hashPayload(payload: ProjectPayload): string {
  return sha256Hex(canonicalize(payload));
}

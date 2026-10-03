/**
 * 前端规范化哈希，必须与后端 canonical.ts 逐字段一致：
 * 后端将据此判断“同请求号是否携带了不同内容”。
 */
export interface CanonicalPayload {
  title: string;
  contentType: string;
  audience: string;
  durationSec: number;
  aspectRatio: string;
  brief?: string | null;
  references?: Array<{ url: string; label?: string | null }>;
  attachments?: Array<{ fileName: string; sizeBytes: number }>;
}

export function canonicalize(payload: CanonicalPayload): string {
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

export async function hashPayload(payload: CanonicalPayload): Promise<string> {
  const text = canonicalize(payload);
  if (crypto?.subtle) {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
    return Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }
  // 非安全上下文兜底（同步弱哈希，仅用于占位；现代浏览器均支持 subtle）
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).padStart(64, "0");
}

export const CONTENT_TYPES = [
  { value: "short_video", label: "短视频", icon: "📱" },
  { value: "vlog", label: "Vlog 日志", icon: "🎒" },
  { value: "documentary", label: "纪录短片", icon: "🎬" },
  { value: "promo", label: "宣传片", icon: "📣" },
  { value: "tutorial", label: "教程视频", icon: "🧭" }
] as const;

export const AUDIENCES = [
  { value: "general", label: "大众受众" },
  { value: "youth", label: "年轻群体" },
  { value: "family", label: "亲子家庭" },
  { value: "professional", label: "专业人士" },
  { value: "tourist", label: "到访游客" }
] as const;

export const ASPECT_RATIOS = [
  { value: "16:9", label: "横屏", hint: "16:9 · 影视/横版平台" },
  { value: "9:16", label: "竖屏", hint: "9:16 · 短视频信息流" },
  { value: "1:1", label: "方形", hint: "1:1 · 社交流" },
  { value: "4:5", label: "竖版", hint: "4:5 · 图文平台" },
  { value: "21:9", label: "宽银幕", hint: "21:9 · 影院感" }
] as const;

export const DURATION_PRESETS = [15, 30, 60, 180, 300, 600] as const;

export type ContentType = (typeof CONTENT_TYPES)[number]["value"];
export type Audience = (typeof AUDIENCES)[number]["value"];
export type AspectRatio = (typeof ASPECT_RATIOS)[number]["value"];

export interface ReferenceDraft {
  localId: string;
  url: string;
  label: string;
}

export type LocalAttachmentStatus =
  | "selected"
  | "checking_quota"
  | "quota_exceeded"
  | "staging_registered"
  | "uploading"
  | "uploaded"
  | "failed"
  | "pending_local";

export interface AttachmentDraft {
  localId: string;
  file?: File;
  fileName: string;
  sizeBytes: number;
  mime: string;
  status: LocalAttachmentStatus;
  progressPct: number;
  stagingId?: string;
  note?: string;
  /** 离线期间创建：先随本地草稿保留，恢复网络后补登 */
  offlineQueued?: boolean;
}

export interface WizardDraft {
  draftVersion: 1;
  /** 草稿身份：创建时生成并持久化，多标签页/离线重连共用 */
  clientRequestId: string;
  title: string;
  contentType: ContentType;
  audience: Audience;
  durationSec: number;
  aspectRatio: AspectRatio;
  brief: string;
  references: ReferenceDraft[];
  attachments: AttachmentDraft[];
  updatedAt: string;
  /** 已成功创建的项目 id（成功响应丢失后据此恢复） */
  committedProjectId?: string;
}

export type ReferenceReachability = "unknown" | "reachable" | "unreachable";
export type ReferenceLicense = "unknown" | "licensed" | "unlicensed";

export interface ReferenceLinkDTO {
  id: string;
  url: string;
  label: string | null;
  formatValid: boolean;
  reachability: ReferenceReachability;
  license: ReferenceLicense;
  status: "pending" | "parsing" | "done";
  jobs: Array<{ id: string; status: string; lastError: string | null }>;
}

export interface AttachmentDTO {
  id: string;
  fileName: string;
  mime: string;
  sizeBytes: number;
  status: "pending_local" | "uploading" | "uploaded" | "failed" | "quota_exceeded";
  progressPct: number;
  failureNote: string | null;
}

export interface ProjectSnapshot {
  version: number;
  title: string;
  contentType: string;
  audience: string;
  durationSec: number;
  aspectRatio: string;
  brief: string;
  script: string;
  referenceUrls: string[];
  attachmentCount: number;
  frozenAt: string;
}

export interface ProjectDTO {
  id: string;
  title: string;
  contentType: string;
  audience: string;
  durationSec: number;
  aspectRatio: string;
  brief: string | null;
  snapshot: ProjectSnapshot;
  createdAt: string;
  frozenScript: string;
  permissionState: { revoked: boolean; revokedAt: string | null };
  draftRequest?: { clientRequestId: string } | null;
  references: ReferenceLinkDTO[];
  attachments: AttachmentDTO[];
}

export interface ProjectListItem {
  id: string;
  title: string;
  contentType: string;
  audience: string;
  durationSec: number;
  aspectRatio: string;
  snapshot: ProjectSnapshot;
  createdAt: string;
  referenceCount: number;
  pendingReferences: number;
  unfinishedAttachments: number;
}

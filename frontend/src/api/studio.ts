import api from "./client";

// ---------- 类型 ----------
export interface SessionUser {
  id: string;
  username: string;
  displayName: string;
  role: string;
  permissions: Record<string, boolean>;
}

export interface DraftPayload {
  basics?: Partial<{
    title: string;
    contentType: string;
    audience: string;
    durationSec: number;
    aspectRatio: string;
    brief: string;
  }>;
  materials?: { url: string; userAttested?: boolean }[];
  step?: number;
}

export interface ServerDraft {
  id: string;
  status: "editing" | "converted";
  version: number;
  updatedAt: string;
  title?: string;
  payload?: DraftPayload;
  projectId?: string | null;
}

export interface CreateProjectPayload {
  draftId: string;
  title: string;
  contentType: string;
  audience: string;
  durationSec: number;
  aspectRatio: string;
  brief: string;
  materials: { url: string; userAttested: boolean }[];
  attachmentIds: string[];
}

export interface CreateProjectResult {
  projectId: string;
  draftId: string;
  recovered: boolean;
  replayed: boolean;
  createdAt: string;
}

export interface ReferenceMaterial {
  id: string;
  url: string;
  version: number;
  formatStatus: "valid" | "invalid";
  reachability: "unknown" | "checking" | "reachable" | "unreachable";
  licenseStatus: "unverified" | "confirmed" | "rejected";
  licenseEvidence: string | null;
  userAttested: boolean;
  parseStatus: "queued" | "parsing" | "parsed" | "failed";
  parsedMeta: {
    probedAt?: string;
    httpStatus?: number | null;
    finalUrl?: string | null;
    contentType?: string | null;
    title?: string | null;
    note?: string;
  } | null;
  lastError: string | null;
}

export interface AttachmentMeta {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  status: "uploading" | "uploaded" | "failed";
  error: string | null;
}

export interface OutlineSection {
  key: string;
  title: string;
  startSec: number;
  endSec: number;
  note: string;
}

export interface FrozenSnapshot {
  version: 1;
  frozenAt: string;
  title: string;
  contentType: string;
  contentTypeLabel: string;
  audience: string;
  audienceLabel: string;
  durationSec: number;
  aspectRatio: string;
  brief: string;
  outline: OutlineSection[];
  productionNotes: string[];
}

export interface ProjectDetail {
  id: string;
  title: string;
  contentType: string;
  audience: string;
  durationSec: number;
  aspectRatio: string;
  brief: string;
  status: string;
  createdAt: string;
  snapshot: FrozenSnapshot;
  materials: ReferenceMaterial[];
  attachments: AttachmentMeta[];
}

export interface ProjectSummary {
  id: string;
  title: string;
  contentType: string;
  durationSec: number;
  aspectRatio: string;
  createdAt: string;
  materialCount: number;
  attachmentCount: number;
}

// ---------- 认证 ----------
export const login = async (username: string, password: string) => {
  const { data } = await api.post<{ token: string; user: SessionUser }>("/auth/login", { username, password });
  return data;
};

export const fetchMe = async () => {
  const { data } = await api.get<{ user: SessionUser }>("/auth/me");
  return data.user;
};

// ---------- 草稿 ----------
export const listDrafts = async () => {
  const { data } = await api.get<{ drafts: ServerDraft[] }>("/drafts");
  return data.drafts;
};

export const getDraft = async (id: string) => {
  const { data } = await api.get<ServerDraft>(`/drafts/${id}`);
  return data;
};

export const upsertDraft = async (id: string, payload: DraftPayload, baseVersion?: number) => {
  const { data } = await api.put<{ id: string; version: number; updatedAt: string }>(
    `/drafts/${id}`,
    { payload, baseVersion },
    { silent: true }
  );
  return data;
};

// ---------- 项目 ----------
export const createProject = async (idempotencyKey: string, payload: CreateProjectPayload) => {
  const { data } = await api.post<CreateProjectResult>("/projects", payload, {
    headers: { "Idempotency-Key": idempotencyKey },
    silent: true
  });
  return data;
};

export const listProjects = async () => {
  const { data } = await api.get<{ projects: ProjectSummary[] }>("/projects");
  return data.projects;
};

export const getProject = async (id: string) => {
  const { data } = await api.get<{ project: ProjectDetail }>(`/projects/${id}`);
  return data.project;
};

// ---------- 素材 ----------
export const updateMaterialUrl = async (id: string, url: string) => {
  const { data } = await api.patch<{ material: ReferenceMaterial }>(`/materials/${id}`, { url });
  return data.material;
};

export const attestMaterial = async (id: string, attested: boolean) => {
  const { data } = await api.post<{ material: ReferenceMaterial }>(`/materials/${id}/attest`, { attested });
  return data.material;
};

// ---------- 附件 ----------
export const registerAttachment = async (input: {
  draftId: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
}) => {
  const { data } = await api.post<{ id: string; status: string }>("/attachments", input, { silent: true });
  return data;
};

export const uploadAttachmentContent = async (
  id: string,
  blob: Blob,
  onProgress: (percent: number) => void
) => {
  const { data } = await api.put<{ id: string; status: string }>(`/attachments/${id}/content`, blob, {
    headers: { "Content-Type": "application/octet-stream" },
    onUploadProgress: (e) => {
      if (e.total) onProgress(Math.round((e.loaded / e.total) * 100));
    },
    silent: true,
    timeout: 120000
  });
  return data;
};

export const markAttachmentFailed = async (id: string, error: string) => {
  await api.post(`/attachments/${id}/fail`, { error }, { silent: true }).catch(() => undefined);
};

export const deleteAttachment = async (id: string) => {
  await api.delete(`/attachments/${id}`, { silent: true });
};

// ---------- 管理（验收演示） ----------
export const setPermission = async (username: string, key: "project:create", granted: boolean) => {
  const { data } = await api.post<{ permission: { granted: boolean } }>("/admin/permissions", {
    username,
    key,
    granted
  });
  return data.permission;
};

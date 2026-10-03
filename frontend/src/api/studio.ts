import api from "./client";
import type {
  AttachmentDraft,
  ProjectDTO,
  ProjectListItem,
  ReferenceDraft,
  WizardDraft
} from "@/types/studio";
import { hashPayload } from "@/lib/canonical";

export interface MeResponse {
  user: { id: string; username: string; role: "admin" | "creator"; canCreate: boolean };
  permissions: { canCreateProject: boolean; grantId: string | null };
}

export const studioApi = {
  login: (username: string, password: string) =>
    api.post<{ token: string; user: MeResponse["user"] & { displayName: string } }>("/auth/login", {
      username,
      password
    }),
  me: () => api.get<MeResponse>("/auth/me"),
  logout: () => api.post("/auth/logout"),

  listProjects: () => api.get<{ items: ProjectListItem[] }>("/projects"),
  getProject: (id: string) => api.get<ProjectDTO>(`/projects/${id}`),

  createProject: async (draft: WizardDraft) => {
    const payloadHash = await hashPayload({
      title: draft.title,
      contentType: draft.contentType,
      audience: draft.audience,
      durationSec: draft.durationSec,
      aspectRatio: draft.aspectRatio,
      brief: draft.brief,
      references: draft.references.map((r: ReferenceDraft) => ({ url: r.url, label: r.label || null })),
      attachments: draft.attachments
        .filter((a: AttachmentDraft) => a.status !== "selected" && a.status !== "checking_quota")
        .map((a) => ({
          stagingId: a.stagingId ?? "",
          fileName: a.fileName,
          sizeBytes: a.sizeBytes
        }))
    });

    return api.post<{ recovered: boolean; project: ProjectDTO }>(
      "/projects",
      {
        clientRequestId: draft.clientRequestId,
        title: draft.title,
        contentType: draft.contentType,
        audience: draft.audience,
        durationSec: draft.durationSec,
        aspectRatio: draft.aspectRatio,
        brief: draft.brief,
        references: draft.references
          .filter((r) => r.url.trim().length > 0)
          .map((r) => ({ url: r.url, label: r.label || null })),
        attachments: draft.attachments
          .filter((a) => a.status !== "selected" && a.status !== "checking_quota")
          .map((a) => ({
            stagingId: a.stagingId ?? "",
            fileName: a.fileName,
            sizeBytes: a.sizeBytes
          }))
      },
      // 创建请求由页面自行解释 409/403/离线，避免默认 toast 与恢复流程打架
      { silent: true, headers: { "X-Payload-Hash": payloadHash } }
    );
  },

  addReference: (projectId: string, url: string, label: string) =>
    api.post<{ project: ProjectDTO }>(`/projects/${projectId}/references`, { url, label: label || null }),
  removeReference: (projectId: string, refId: string) =>
    api.delete<{ project: ProjectDTO }>(`/projects/${projectId}/references/${refId}`),

  registerStaging: (fileName: string, mime: string, sizeBytes: number) =>
    api.post<{ staging: { id: string; status: string } }>("/staging", { fileName, mime, sizeBytes }, { silent: true }),
  uploadStaging: (
    stagingId: string,
    file: Blob,
    onProgress: (pct: number) => void,
    signal?: AbortSignal
  ) =>
    new Promise<void>((resolve, reject) => {
      // XHR 以便获得上传进度（fetch 无法观测上传进度）
      const xhr = new XMLHttpRequest();
      // @ts-ignore
      const base = (import.meta.env.VITE_API_BASE as string) || "/api";
      xhr.open("PUT", `${base}/staging/${stagingId}/content`);
      const token = localStorage.getItem("creative-studio-token");
      if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100));
      };
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) resolve();
        else reject(new Error(xhr.status === 413 ? "文件过大" : "上传失败 (" + xhr.status + ")"));
      };
      xhr.onerror = () => reject(new Error("网络中断，上传暂停（本机草稿保留）"));
      xhr.onabort = () => reject(new Error("aborted"));
      if (signal) {
        signal.addEventListener("abort", () => xhr.abort());
      }
      xhr.send(file);
    }),

  // 管理员/验收控制台
  adminRevoke: (username: string) => api.post("/admin/permissions/revoke", { username }),
  adminRestore: (username: string) => api.post("/admin/permissions/restore", { username }),
  adminListUsers: () =>
    api.get<{
      users: Array<{
        id: string;
        username: string;
        displayName: string;
        role: string;
        canCreate: boolean;
        permissions: Array<{ id: string; scope: string; revokedAt: string | null }>;
      }>;
    }>("/admin/users"),
  adminDecideReference: (
    refId: string,
    decision: { reachability?: "reachable" | "unreachable"; license?: "licensed" | "unlicensed" | "unknown" }
  ) => api.post(`/admin/references/${refId}/decision`, decision)
};

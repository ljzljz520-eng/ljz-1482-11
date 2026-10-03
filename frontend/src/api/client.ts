import axios, { AxiosError } from "axios";

declare module "axios" {
  export interface AxiosRequestConfig {
    /** 静默标记：调用方自行处理错误（如 409 冲突恢复），拦截器不弹 toast */
    silent?: boolean;
  }
}
import { toast } from "react-hot-toast";

const api = axios.create({
  // @ts-ignore
  baseURL: import.meta.env.VITE_API_BASE || "/api",
  timeout: 15000
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("creative-studio-token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// 静默标记：调用方自行处理错误（如创建页的 409 冲突恢复）
export interface SilentConfig {
  silent?: boolean;
}

api.interceptors.response.use(
  (response) => response,
  (error: AxiosError<{ error?: { code: string; message: string } }>) => {
    const cfg = error.config as (typeof error.config & SilentConfig) | undefined;
    const status = error.response?.status;
    const payload = error.response?.data?.error;

    if (status === 401 && !location.pathname.startsWith("/studio/login")) {
      localStorage.removeItem("creative-studio-token");
      localStorage.removeItem("creative-studio-user");
      if (!cfg?.silent) toast.error("登录已过期，请重新登录");
      window.setTimeout(() => {
        if (!location.pathname.startsWith("/studio/login")) {
          location.assign("/studio/login?redirect=" + encodeURIComponent(location.pathname + location.search));
        }
      }, 600);
      return Promise.reject(error);
    }

    if (!cfg?.silent) {
      if (error.code === "ECONNABORTED" || error.message === "Network Error") {
        toast.error("网络连接失败：内容已保存在本机草稿，恢复网络后可继续提交");
      } else if (payload?.message) {
        toast.error(payload.message);
      } else {
        toast.error("请求失败，请稍后重试");
      }
    }
    return Promise.reject(error);
  }
);

export default api;

import axios, { AxiosError } from "axios";
import { toast } from "react-hot-toast";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE || "/api",
  timeout: 15000
});

// 请求拦截：注入 Bearer Token
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("yunxi.auth.token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

declare module "axios" {
  interface AxiosRequestConfig {
    /** 为 true 时不在拦截器里弹全局错误 Toast（由调用方自行处理） */
    silent?: boolean;
  }
}

api.interceptors.response.use(
  (response) => response,
  (error: AxiosError<{ error?: { code?: string; message?: string } }>) => {
    const status = error.response?.status;
    const code = error.response?.data?.error?.code;
    const message = error.response?.data?.error?.message;
    if (status === 401) {
      localStorage.removeItem("yunxi.auth.token");
      localStorage.removeItem("yunxi.auth.user");
      if (!location.pathname.startsWith("/login")) {
        toast.error("登录已过期，请重新登录");
        location.assign("/login");
      }
    } else if (!error.config?.silent) {
      if (error.code === "ERR_NETWORK" || error.message === "Network Error") {
        toast.error("网络连接失败，操作将进入离线队列");
      } else {
        toast.error(message ?? `请求失败（${status ?? "网络错误"}${code ? ` · ${code}` : ""}）`);
      }
    }
    return Promise.reject(error);
  }
);

export const isNetworkError = (e: unknown) =>
  axios.isAxiosError(e) && !e.response && (e.code === "ERR_NETWORK" || e.message === "Network Error");

export const apiError = (e: unknown) =>
  axios.isAxiosError(e) ? e.response?.data?.error : undefined;

export default api;

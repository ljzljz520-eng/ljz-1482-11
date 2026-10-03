import { create } from "zustand";
import { SessionUser, fetchMe } from "@/api/studio";
import { safeStorage } from "@/utils/safeStorage";

const TOKEN_KEY = "yunxi.auth.token";
const USER_KEY = "yunxi.auth.user";

interface AuthState {
  token: string | null;
  user: SessionUser | null;
  setSession: (token: string, user: SessionUser) => void;
  setUser: (user: SessionUser) => void;
  logout: () => void;
  refreshMe: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  token: safeStorage.get<string | null>(TOKEN_KEY, null),
  user: safeStorage.get<SessionUser | null>(USER_KEY, null),
  setSession: (token, user) => {
    safeStorage.set(TOKEN_KEY, token);
    safeStorage.set(USER_KEY, user);
    set({ token, user });
  },
  setUser: (user) => {
    safeStorage.set(USER_KEY, user);
    set({ user });
  },
  logout: () => {
    safeStorage.remove(TOKEN_KEY);
    safeStorage.remove(USER_KEY);
    set({ token: null, user: null });
  },
  // 权限可能被管理员随时收回：页面聚焦/定时刷新时同步最新权限
  refreshMe: async () => {
    if (!get().token) return;
    try {
      const user = await fetchMe();
      get().setUser(user);
    } catch {
      /* 401 由拦截器统一处理 */
    }
  }
}));

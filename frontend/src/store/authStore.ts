import { create } from "zustand";

export interface AuthUser {
  id: string;
  username: string;
  displayName: string;
  role: "admin" | "creator";
  canCreate: boolean;
}

interface AuthState {
  token: string | null;
  user: AuthUser | null;
  canCreateProject: boolean;
  setSession: (token: string, user: AuthUser, canCreateProject: boolean) => void;
  setPermission: (canCreateProject: boolean) => void;
  logout: () => void;
  hydrate: () => void;
}

const TOKEN_KEY = "creative-studio-token";
const USER_KEY = "creative-studio-user";

export const useAuthStore = create<AuthState>((set) => ({
  token: null,
  user: null,
  canCreateProject: false,
  setSession: (token, user, canCreateProject) => {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
    set({ token, user, canCreateProject });
  },
  setPermission: (canCreateProject) => set({ canCreateProject }),
  logout: () => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    set({ token: null, user: null, canCreateProject: false });
  },
  hydrate: () => {
    const token = localStorage.getItem(TOKEN_KEY);
    const rawUser = localStorage.getItem(USER_KEY);
    if (token && rawUser) {
      try {
        set({ token, user: JSON.parse(rawUser) as AuthUser });
      } catch {
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(USER_KEY);
      }
    }
  }
}));

export function getToken(): string | null {
  return localStorage.getItem("creative-studio-token");
}

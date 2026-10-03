import { ReactNode, useEffect, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { studioApi } from "@/api/studio";
import { useAuthStore } from "@/store/authStore";
import { Spinner } from "./ui";

export default function ProtectedRoute({ children }: { children: ReactNode }) {
  const location = useLocation();
  const { token, hydrate, setPermission } = useAuthStore();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  useEffect(() => {
    const saved = localStorage.getItem("creative-studio-token");
    if (!saved) {
      setChecking(false);
      return;
    }
    studioApi
      .me()
      .then(({ data }) => setPermission(data.permissions.canCreateProject))
      .catch(() => undefined)
      .finally(() => setChecking(false));
  }, [setPermission]);

  if (checking) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center gap-2 text-slate-400">
        <Spinner /> 正在校验登录状态…
      </div>
    );
  }

  if (!token) {
    return <Navigate to={`/studio/login?redirect=${encodeURIComponent(location.pathname + location.search)}`} replace />;
  }
  return <>{children}</>;
}

import { useEffect } from "react";
import { toast } from "react-hot-toast";
import axios from "axios";
import { createProject } from "@/api/studio";
import { useWizardStore } from "@/store/wizardStore";
import { useAuthStore } from "@/store/authStore";

/**
 * 离线发件箱：创建请求因断网失败时入队（同一 Idempotency-Key），
 * 网络恢复后自动重放 —— 服务端幂等保证不会产生副本。
 */
export function useOutbox() {
  const token = useAuthStore((s) => s.token);

  useEffect(() => {
    if (!token) return;
    let running = false;

    const replay = async () => {
      if (running) return;
      const pending = useWizardStore.getState().pendingCreate;
      if (!pending) return;
      running = true;
      try {
        const result = await createProject(pending.requestId, pending.payload);
        useWizardStore.getState().markConverted(result.projectId);
        toast.success(
          result.recovered || result.replayed
            ? "离线请求已重放：命中幂等记录，恢复原项目（未创建副本）"
            : "离线排队的项目已创建成功",
          { duration: 5000 }
        );
      } catch (err) {
        if (axios.isAxiosError(err) && err.response) {
          const code = err.response.data?.error?.code;
          if (code === "IDEMPOTENCY_CONFLICT") {
            useWizardStore.getState().setPendingCreate(null);
            toast.error("离线请求与服务器记录冲突，已放弃重放");
          } else if (code === "PERMISSION_REVOKED") {
            toast.error("创建权限已被收回，离线请求暂存待权限恢复");
          }
          // 其他 4xx/5xx：保留队列，下次继续
        }
        // 网络错误：保持排队
      } finally {
        running = false;
      }
    };

    void replay();
    window.addEventListener("online", replay);
    const timer = setInterval(replay, 15000);
    return () => {
      window.removeEventListener("online", replay);
      clearInterval(timer);
    };
  }, [token]);
}

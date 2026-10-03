import { FormEvent, useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { studioApi } from "@/api/studio";
import { useAuthStore } from "@/store/authStore";
import { Button, Card, TextInput } from "@/components/studio/ui";
import { Spinner } from "@/components/studio/ui";

const DEMO = [
  { username: "admin", password: "123456", desc: "管理员（可验收授权收回/恢复）" },
  { username: "creator", password: "123456", desc: "演示创作者（含示例项目）" },
  { username: "guest", password: "123456", desc: "待授权访客（创建会被 403 拒绝）" }
];

export default function Login() {
  const [username, setUsername] = useState("creator");
  const [password, setPassword] = useState("123456");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { setSession, token } = useAuthStore();

  useEffect(() => {
    if (token) navigate(params.get("redirect") ?? "/studio", { replace: true });
  }, [token, navigate, params]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { data } = await studioApi.login(username.trim(), password);
      const me = await studioApi.me();
      setSession(data.token, { id: data.user.id, username: data.user.username, displayName: data.user.displayName, role: data.user.role, canCreate: data.user.canCreate }, me.data.permissions.canCreateProject);
      navigate(params.get("redirect") ?? "/studio", { replace: true });
    } catch (err: unknown) {
      const anyErr = err as { response?: { data?: { error?: { message?: string } } } };
      setError(anyErr.response?.data?.error?.message ?? "登录失败");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto flex max-w-md flex-col gap-5 px-4 py-14">
      <div className="text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-accent text-white text-xl font-bold shadow-card">
          创
        </div>
        <h1 className="mt-4 text-2xl font-bold text-slate-900">登录创作工作室</h1>
        <p className="mt-1 text-sm text-slate-500">幂等草稿 · 事务初始化 · 独立解析队列</p>
      </div>
      <Card>
        <form onSubmit={submit} className="space-y-4">
          <label className="block space-y-1.5 text-sm font-medium text-slate-700">
            账号
            <TextInput value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" />
          </label>
          <label className="block space-y-1.5 text-sm font-medium text-slate-700">
            密码
            <TextInput type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
          </label>
          {error && <p className="text-sm text-rose-500">{error}</p>}
          <Button className="w-full" disabled={busy}>
            {busy ? <Spinner /> : "登录"}
          </Button>
        </form>
      </Card>
      <Card className="space-y-2">
        <p className="text-xs font-semibold text-slate-500">演示账号（点击填充）</p>
        {DEMO.map((d) => (
          <button
            key={d.username}
            type="button"
            onClick={() => {
              setUsername(d.username);
              setPassword(d.password);
            }}
            className="flex w-full items-center justify-between rounded-xl bg-slate-50 px-3.5 py-2.5 text-left transition hover:bg-primary/5"
          >
            <span className="text-sm font-semibold text-slate-800">{d.username} / {d.password}</span>
            <span className="text-xs text-slate-400">{d.desc}</span>
          </button>
        ))}
      </Card>
    </div>
  );
}

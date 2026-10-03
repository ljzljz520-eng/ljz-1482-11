import { FormEvent, useState } from "react";
import { useLocation, useNavigate, Link } from "react-router-dom";
import { toast } from "react-hot-toast";
import { z } from "zod";
import { login } from "@/api/studio";
import { useAuthStore } from "@/store/authStore";

const schema = z.object({
  username: z.string().min(1, "请输入用户名"),
  password: z.string().min(1, "请输入密码")
});

const Login = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const setSession = useAuthStore((s) => s.setSession);
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const parsed = schema.safeParse({ username, password });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "请检查输入");
      return;
    }
    setSubmitting(true);
    try {
      const { token, user } = await login(username.trim(), password);
      setSession(token, user);
      toast.success(`欢迎回来，${user.displayName}`);
      const from = (location.state as { from?: string } | null)?.from ?? "/create";
      navigate(from, { replace: true });
    } catch {
      /* 拦截器已提示 */
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-[70vh] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <div className="bg-white/85 border border-white shadow-card rounded-3xl p-8 backdrop-blur">
          <div className="text-center mb-6">
            <div className="mx-auto h-14 w-14 rounded-2xl bg-gradient-to-br from-primary to-accent flex items-center justify-center text-white text-xl font-bold shadow-card">
              云溪
            </div>
            <h1 className="mt-4 text-2xl font-bold text-slate-900">登录创作工坊</h1>
            <p className="mt-1 text-sm text-slate-500">草稿、权限与项目数据均保存在服务端</p>
          </div>
          <form onSubmit={onSubmit} className="space-y-4">
            <label className="block">
              <span className="text-sm font-medium text-slate-700">用户名</span>
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
                placeholder="admin"
                autoComplete="username"
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-slate-700">密码</span>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
                placeholder="••••••"
                autoComplete="current-password"
              />
            </label>
            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-xl bg-primary py-2.5 text-sm font-semibold text-white shadow-card transition hover:bg-primary/90 active:scale-[0.99] disabled:opacity-60"
            >
              {submitting ? "登录中…" : "登 录"}
            </button>
          </form>
          <div className="mt-6 rounded-xl bg-slate-50 border border-slate-100 p-3 text-xs text-slate-500 leading-relaxed">
            <p className="font-medium text-slate-600 mb-1">演示账号（密码均为 123456）</p>
            <p>admin — 管理员，可创建项目、可演示权限收回</p>
            <p>creator — 创作者，可创建项目</p>
            <p>guest — 已被收回创建权限（用于验收 403 场景）</p>
          </div>
        </div>
        <p className="mt-4 text-center text-sm text-slate-500">
          <Link to="/" className="hover:text-primary transition">← 返回公园首页</Link>
        </p>
      </div>
    </div>
  );
};

export default Login;

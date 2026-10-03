import { Link, useLocation, useNavigate } from "react-router-dom";
import { ReactNode, useEffect, useMemo, useState } from "react";
import { useUIStore } from "@/store/uiStore";
import { useAuthStore } from "@/store/authStore";
import { studioApi } from "@/api/studio";
import clsx from "clsx";

const navItems = [
  { path: "/", label: "公园总览", exact: true },
  { path: "/audiovisual", label: "视听体验", exact: false },
  { path: "/timeline", label: "时间轴", exact: false },
  { path: "/studio", label: "创作工作室", exact: false }
];

const Layout = ({ children }: { children: ReactNode }) => {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { isMenuOpen, toggleMenu } = useUIStore();
  const { token, user, hydrate, logout } = useAuthStore();
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    hydrate();
  }, [hydrate, pathname]);

  const activeMatch = useMemo(() => pathname, [pathname]);

  const isActive = (path: string, exact: boolean) => (exact ? pathname === path : pathname.startsWith(path));

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      await studioApi.logout().catch(() => undefined);
    } finally {
      logout();
      setLoggingOut(false);
      navigate("/studio/login");
    }
  };

  return (
    <div className="min-h-screen flex flex-col">
      <header className="sticky top-0 z-30 backdrop-blur bg-white/80 border-b border-slate-200">
        <div className="mx-auto max-w-6xl px-4 py-3 flex items-center justify-between gap-3">
          <Link to="/" className="flex items-center gap-2">
            <span className="h-10 w-10 rounded-2xl bg-gradient-to-br from-primary to-accent shadow-card flex items-center justify-center text-white font-bold">
              云溪
            </span>
            <div>
              <p className="text-sm text-slate-500">城市微度假</p>
              <h1 className="text-lg font-semibold text-slate-900">云溪创作工作室</h1>
            </div>
          </Link>
          <nav className="hidden md:flex items-center gap-2">
            {navItems.map((item) => (
              <Link
                key={item.path}
                to={item.path}
                className={clsx(
                  "px-3 py-2 rounded-full text-sm font-medium transition hover:bg-primary/10",
                  isActive(item.path, item.exact) ? "bg-primary/10 text-primary" : "text-slate-600"
                )}
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            {pathname.startsWith("/studio") &&
              (token ? (
                <div className="hidden md:flex items-center gap-2">
                  <span className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-600">
                    {user?.displayName ?? user?.username}
                  </span>
                  <button
                    onClick={handleLogout}
                    disabled={loggingOut}
                    className="rounded-full border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-500 transition hover:border-rose-300 hover:text-rose-500"
                  >
                    退出
                  </button>
                </div>
              ) : (
                <Link to="/studio/login" className="hidden md:inline-flex rounded-full bg-gradient-to-r from-primary to-accent px-4 py-1.5 text-xs font-semibold text-white shadow-card">
                  登录
                </Link>
              ))}
            <button
              onClick={toggleMenu}
              className="md:hidden inline-flex items-center justify-center h-10 w-10 rounded-full border border-slate-200 hover:border-primary hover:text-primary transition"
              aria-label="Toggle menu"
            >
              <span className="block h-0.5 w-5 bg-current relative">
                <span className="block absolute -top-1.5 h-0.5 w-5 bg-current" />
                <span className="block absolute top-1.5 h-0.5 w-5 bg-current" />
              </span>
            </button>
          </div>
        </div>
        {isMenuOpen && (
          <div className="md:hidden border-t border-slate-200 bg-white/95">
            <div className="max-w-6xl mx-auto px-4 py-3 grid grid-cols-2 gap-2">
              {navItems.map((item) => (
                <Link
                  key={item.path}
                  to={item.path}
                  className={clsx(
                    "px-3 py-2 rounded-xl text-sm font-medium transition hover:bg-primary/10",
                    isActive(item.path, item.exact) ? "bg-primary/10 text-primary" : "text-slate-600"
                  )}
                  onClick={toggleMenu}
                >
                  {item.label}
                </Link>
              ))}
              {pathname.startsWith("/studio") &&
                (token ? (
                  <button onClick={handleLogout} className="px-3 py-2 rounded-xl text-sm font-medium text-rose-500 hover:bg-rose-50 text-left">
                    退出登录
                  </button>
                ) : (
                  <Link to="/studio/login" onClick={toggleMenu} className="px-3 py-2 rounded-xl text-sm font-medium text-primary hover:bg-primary/10">
                    登录
                  </Link>
                ))}
            </div>
          </div>
        )}
      </header>
      <main className="flex-1">{children}</main>
      <footer className="border-t border-slate-200 bg-white/70 backdrop-blur">
        <div className="mx-auto max-w-6xl px-4 py-6 flex flex-col md:flex-row items-center justify-between gap-3">
          <p className="text-sm text-slate-500">© 2026 云溪创作工作室 · 自然与创作共生</p>
          <div className="flex gap-3 text-sm text-slate-500">
            <span>开放时间：06:00 - 22:00</span>
            <span>服务热线：400-123-4567</span>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Layout;

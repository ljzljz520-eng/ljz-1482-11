import { Component, ErrorInfo, ReactNode } from "react";
import { toast } from "react-hot-toast";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(): void {
    toast.error("页面出现小问题，已为你记录。");
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-[60vh] flex items-center justify-center bg-white px-4">
          <div className="max-w-md rounded-3xl border border-slate-100 bg-white p-8 text-center shadow-card space-y-4">
            <p className="text-4xl">🫠</p>
            <p className="text-2xl font-bold text-slate-900">页面出现小问题</p>
            <p className="text-slate-500">你的本机草稿不会丢失，可安全刷新或返回工作室首页。</p>
            <div className="flex justify-center gap-3">
              <button
                onClick={() => window.location.reload()}
                className="rounded-xl bg-gradient-to-r from-primary to-accent px-5 py-2.5 text-sm font-semibold text-white shadow-card transition hover:-translate-y-0.5"
              >
                刷新页面
              </button>
              <button
                onClick={() => (window.location.href = "/studio")}
                className="rounded-xl border border-slate-200 px-5 py-2.5 text-sm font-semibold text-slate-600 transition hover:border-primary hover:text-primary"
              >
                返回工作室
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;

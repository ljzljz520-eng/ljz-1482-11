/**
 * 配额安全的本地存储封装。
 * localStorage 在隐私模式/配额耗尽时会抛 QuotaExceededError / SecurityError，
 * 捕获后通过回调通知上层降级（验收场景：浏览器配额不足）。
 */
export type QuotaListener = (key: string) => void;

let quotaListener: QuotaListener | null = null;
export function onQuotaExceeded(listener: QuotaListener) {
  quotaListener = listener;
}

export const safeStorage = {
  get<T>(key: string, fallback: T): T {
    try {
      const raw = localStorage.getItem(key);
      return raw ? (JSON.parse(raw) as T) : fallback;
    } catch {
      return fallback;
    }
  },
  /** @returns true 写入成功；false 写入失败（配额不足或被禁用） */
  set<T>(key: string, value: T): boolean {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (e) {
      if (e instanceof DOMException && (e.name === "QuotaExceededError" || e.name === "SecurityError")) {
        quotaListener?.(key);
        return false;
      }
      quotaListener?.(key);
      return false;
    }
  },
  remove(key: string) {
    try {
      localStorage.removeItem(key);
    } catch {
      /* 忽略：存储不可用时的清理失败无害 */
    }
  }
};

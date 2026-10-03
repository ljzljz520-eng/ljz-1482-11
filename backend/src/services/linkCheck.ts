/**
 * 参考链接三级校验 —— 第 1 级：格式检查（同步、确定性）。
 * 注意：格式合法 ≠ 可访问；HTTP 可访问 ≠ 已获得使用许可。
 */
export interface FormatCheckResult {
  ok: boolean;
  reason?: string;
  normalized?: string;
}

const MAX_URL_LENGTH = 2048;

export function checkUrlFormat(raw: string): FormatCheckResult {
  const url = (raw || "").trim();
  if (!url) return { ok: false, reason: "链接不能为空" };
  if (url.length > MAX_URL_LENGTH) return { ok: false, reason: `链接长度超过 ${MAX_URL_LENGTH} 字符` };
  if (/\s/.test(url)) return { ok: false, reason: "链接中不能包含空白字符" };
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { ok: false, reason: "不是合法的 URL 格式" };
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { ok: false, reason: "仅支持 http/https 协议的链接" };
  }
  if (parsed.username || parsed.password) {
    return { ok: false, reason: "链接中不允许携带用户名或密码" };
  }
  if (!parsed.hostname.includes(".") && parsed.hostname !== "localhost") {
    return { ok: false, reason: "域名格式不完整" };
  }
  return { ok: true, normalized: parsed.toString() };
}

/** SSRF 防护：阻止解析器访问环回/内网/链路本地地址。 */
export function isPrivateHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  if (h === "localhost" || h === "localhost.localdomain" || h.endsWith(".localhost")) return true;
  if (h === "[::1]" || h === "::1") return true;
  const m = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (m) {
    const [a, b] = [Number(m[1]), Number(m[2])];
    if (a === 10 || a === 127 || a === 0) return true; // 10/8, 127/8, 0/8
    if (a === 169 && b === 254) return true; // link-local
    if (a === 172 && b >= 16 && b <= 31) return true; // 172.16/12
    if (a === 192 && b === 168) return true; // 192.168/16
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  }
  return false;
}

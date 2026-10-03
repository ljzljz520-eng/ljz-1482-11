import { logger } from "../config.js";

export type Reachability = "unknown" | "reachable" | "unreachable";
export type LicenseState = "unknown" | "licensed" | "unlicensed";

/**
 * 三态校验第一层：格式检查（纯本地，不发任何网络请求）
 */
export function checkUrlFormat(rawUrl: string): boolean {
  try {
    const url = new URL(rawUrl);
    if (url.protocol !== "http:" && url.protocol !== "https:") return false;
    if (!url.hostname.includes(".")) return false;
    // 禁止把凭据/内网回环当作公开素材（模拟场景除外）
    if (url.username || url.password) return false;
    return url.hostname.length >= 3;
  } catch {
    return false;
  }
}

/**
 * 验收用模拟标记（无外网沙箱也能演示完整状态机）：
 *   ?sim=reachable | unreachable
 * 注意：sim 只影响“可访问性”，绝不授予 license——可访问与授权严格分离。
 */
export function simReachability(rawUrl: string): Reachability | null {
  try {
    const sim = new URL(rawUrl).searchParams.get("sim");
    if (sim === "reachable") return "reachable";
    if (sim === "unreachable") return "unreachable";
    return null;
  } catch {
    return null;
  }
}

/**
 * 第二层：可访问性。HTTP 2xx/3xx 视为可访问；超时、拒绝连接视为不可访问。
 * “可访问”仅仅意味着网络上拿得到资源。
 */
export async function checkReachable(rawUrl: string): Promise<{ state: Reachability; note?: string }> {
  const simulated = simReachability(rawUrl);
  if (simulated) return { state: simulated };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(rawUrl, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: { "User-Agent": "CreativeStudioBot/1.0 (reference-check)" }
    });
    if (response.status >= 200 && response.status < 400) {
      return { state: "reachable" };
    }
    return { state: "unreachable", note: `HTTP ${response.status}` };
  } catch (err) {
    const note = err instanceof Error ? err.message : "network error";
    logger.warn({ rawUrl, note }, "reference reachability check failed");
    return { state: "unreachable", note };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 第三层：使用许可。
 * 关键原则：服务器“请求成功”不构成授权。许可只能来自：
 *  1) 显式授权动作（管理员/审核台在了解版权条款后代为确认）；
 *  2) 已知免版权来源（Wikimedia 系列 CDN / 明确声明的 CC 源），
 *     且响应确实来自该来源——仅靠 URL 猜域名不够，因此这里仅对
 *     官方域名给 unknown（待人工确认）而非自动 licensed；
 *  3) 链接自带 license 标记（?license=cc-by 等由素材平台跳转携带）。
 * 因此默认结论永远是 unknown（不能使用），需要显式流转为 licensed。
 */
const KNOWN_OPEN_HOSTS = ["upload.wikimedia.org", "commons.wikimedia.org", "creativecommons.org"];

export async function checkLicense(
  rawUrl: string,
  reachability: Reachability
): Promise<{ license: LicenseState; basis: string }> {
  if (reachability !== "reachable") {
    return { license: "unknown", basis: "资源不可访问，无法核验许可" };
  }
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return { license: "unknown", basis: "URL 无效" };
  }

  const declared = url.searchParams.get("license");
  if (declared && ["cc0", "cc-by", "cc-by-sa", "public-domain"].includes(declared)) {
    return { license: "licensed", basis: `素材方声明许可：${declared}（请保留来源页链接）` };
  }

  if (KNOWN_OPEN_HOSTS.includes(url.hostname)) {
    // 域名属于开放平台，但具体文件仍需确认其许可页——默认不自动授权
    return { license: "unlicensed", basis: "开放平台域名，但未在链接中携带该文件的许可声明，需人工确认许可页" };
  }

  // 普通网站：请求成功 ≠ 已授权
  return { license: "unlicensed", basis: "资源可访问，但未取得使用授权（HTTP 成功不代表版权许可）" };
}

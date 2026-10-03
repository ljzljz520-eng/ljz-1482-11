import { prisma } from "../lib/prisma";
import { config } from "../config";
import { logger } from "../logger";
import { checkUrlFormat, isPrivateHost } from "./linkCheck";

/**
 * 独立解析队列的消费者逻辑。
 * 三级校验语义（严格区分，绝不混淆）：
 *   1. 格式检查 formatStatus      —— URL 语法/协议合法性（同步已完成，这里复核）
 *   2. 可访问性 reachability      —— 实际发起 HTTP 探测，记录状态码与最终地址
 *   3. 使用许可 licenseStatus     —— 仅依据许可证据（用户声明 / 页面 license 元数据 / CC 链接模式）
 *      关键原则：HTTP 200 只代表"能访问"，绝不作为授权依据。
 */

const MAX_BODY_BYTES = 256 * 1024;

interface ProbeResult {
  reachable: boolean;
  httpStatus?: number;
  finalUrl?: string;
  contentType?: string;
  title?: string;
  licenseHints: string[];
  error?: string;
}

async function probeUrl(url: string): Promise<ProbeResult> {
  const parsed = new URL(url);
  if (isPrivateHost(parsed.hostname)) {
    return { reachable: false, licenseHints: [], error: "目标地址为内网/环回地址，已按安全策略拦截" };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.fetchTimeoutMs);
  try {
    // 先 HEAD；不被支持时降级 GET（限量读取）
    let res = await fetch(url, {
      method: "HEAD",
      redirect: "follow",
      signal: controller.signal,
      headers: { "user-agent": "YunxiStudio-LinkChecker/1.0" }
    }).catch((e) => {
      throw e;
    });
    if (res.status === 405 || res.status === 501) {
      res = await fetch(url, {
        method: "GET",
        redirect: "follow",
        signal: controller.signal,
        headers: { "user-agent": "YunxiStudio-LinkChecker/1.0" }
      });
    }

    const contentType = res.headers.get("content-type") ?? undefined;
    const result: ProbeResult = {
      reachable: res.status >= 200 && res.status < 400,
      httpStatus: res.status,
      finalUrl: res.url,
      contentType,
      licenseHints: []
    };

    // 许可线索 1：HTTP Link 头中的 rel=license
    const linkHeader = res.headers.get("link");
    if (linkHeader && /rel="?license"?/i.test(linkHeader)) {
      result.licenseHints.push(`HTTP Link 头声明许可：${linkHeader.slice(0, 200)}`);
    }

    // 许可线索 2 / 标题提取：仅对 HTML 限量读取正文
    if (result.reachable && contentType?.includes("text/html")) {
      const text = await readLimited(res, MAX_BODY_BYTES);
      const titleMatch = text.match(/<title[^>]*>([^<]{1,200})<\/title>/i);
      if (titleMatch) result.title = titleMatch[1].trim();
      const relLicense = text.match(/<link[^>]+rel=["']license["'][^>]*>/i);
      if (relLicense) result.licenseHints.push(`页面 <link rel="license">：${relLicense[0].slice(0, 200)}`);
      const metaLicense = text.match(/<meta[^>]+name=["']license["'][^>]*>/i);
      if (metaLicense) result.licenseHints.push(`页面 meta license：${metaLicense[0].slice(0, 200)}`);
      const cc = text.match(/creativecommons\.org\/licenses\/[\w./-]+/i);
      if (cc) result.licenseHints.push(`页面引用 CC 许可：${cc[0]}`);
    }
    return result;
  } catch (err) {
    const msg = err instanceof Error ? (err.name === "AbortError" ? "连接超时" : err.message) : String(err);
    return { reachable: false, licenseHints: [], error: msg };
  } finally {
    clearTimeout(timer);
  }
}

async function readLimited(res: Response, maxBytes: number): Promise<string> {
  if (!res.body) return "";
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        chunks.push(value);
        total += value.length;
        if (total >= maxBytes) break;
      }
    }
  } catch {
    /* 读取中断时仍使用已读部分 */
  } finally {
    reader.cancel().catch(() => undefined);
  }
  return new TextDecoder().decode(concat(chunks, total));
}

function concat(chunks: Uint8Array[], total: number): Uint8Array {
  const out = new Uint8Array(Math.min(total, MAX_BODY_BYTES));
  let offset = 0;
  for (const c of chunks) {
    out.set(c.subarray(0, Math.min(c.length, out.length - offset)), offset);
    offset += c.length;
    if (offset >= out.length) break;
  }
  return out;
}

/** 许可判定：只看证据，不看 HTTP 状态。 */
function evaluateLicense(url: string, hints: string[], userAttested: boolean): { status: string; evidence: string | null } {
  if (userAttested) return { status: "confirmed", evidence: "用户声明已获授权" };
  const ccInUrl = url.match(/creativecommons\.org\/licenses\/[\w./-]+/i);
  if (ccInUrl) return { status: "confirmed", evidence: `链接本身为 CC 许可页：${ccInUrl[0]}` };
  if (hints.length > 0) return { status: "confirmed", evidence: hints.join("；").slice(0, 500) };
  return { status: "unverified", evidence: null };
}

export async function processParseJob(jobId: string): Promise<void> {
  const job = await prisma.parseJob.findUnique({ where: { id: jobId }, include: { material: true } });
  if (!job || job.status !== "running") return;
  const material = job.material;

  // 版本护栏：解析期间用户改了链接 → 本任务结果作废
  if (material.version !== job.materialVersion) {
    await prisma.parseJob.update({ where: { id: job.id }, data: { status: "stale" } });
    logger.info({ jobId, materialId: material.id }, "parse job stale: material version moved on");
    return;
  }

  try {
    const format = checkUrlFormat(material.url);
    if (!format.ok) {
      await prisma.$transaction([
        prisma.referenceMaterial.update({
          where: { id: material.id },
          data: { formatStatus: "invalid", parseStatus: "failed", lastError: `格式校验失败：${format.reason}` }
        }),
        prisma.parseJob.update({ where: { id: job.id }, data: { status: "failed", lastError: format.reason } })
      ]);
      return;
    }

    await prisma.referenceMaterial.update({ where: { id: material.id }, data: { reachability: "checking", parseStatus: "parsing" } });
    const probe = await probeUrl(material.url);
    const license = evaluateLicense(material.url, probe.licenseHints, material.userAttested);

    const parsedMeta = {
      probedAt: new Date().toISOString(),
      httpStatus: probe.httpStatus ?? null,
      finalUrl: probe.finalUrl ?? null,
      contentType: probe.contentType ?? null,
      title: probe.title ?? null,
      note: probe.reachable
        ? "HTTP 可访问仅代表资源存在，不代表已获得使用许可"
        : "资源当前不可访问，许可状态仍需人工确认"
    };

    // 写回前再次校验版本，过期结果直接丢弃
    const fresh = await prisma.referenceMaterial.findUnique({ where: { id: material.id } });
    if (!fresh || fresh.version !== job.materialVersion) {
      await prisma.parseJob.update({ where: { id: job.id }, data: { status: "stale" } });
      logger.info({ jobId, materialId: material.id }, "parse result discarded: material edited during parse");
      return;
    }

    await prisma.$transaction([
      prisma.referenceMaterial.update({
        where: { id: material.id },
        data: {
          reachability: probe.reachable ? "reachable" : "unreachable",
          licenseStatus: license.status,
          licenseEvidence: license.evidence,
          parseStatus: "parsed",
          parsedMeta,
          lastError: probe.reachable ? null : probe.error ?? `HTTP ${probe.httpStatus ?? "错误"}`
        }
      }),
      prisma.parseJob.update({ where: { id: job.id }, data: { status: "done" } })
    ]);
    logger.info({ materialId: material.id, reachable: probe.reachable, license: license.status }, "material parsed");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const attempts = job.attempt;
    if (attempts < config.workerMaxAttempts) {
      const backoffSec = attempts * 10;
      await prisma.parseJob.update({
        where: { id: job.id },
        data: { status: "queued", lastError: message, runAfter: new Date(Date.now() + backoffSec * 1000) }
      });
      logger.warn({ jobId, attempt: attempts, err: message }, "parse job failed, scheduled retry");
    } else {
      await prisma.$transaction([
        prisma.parseJob.update({ where: { id: job.id }, data: { status: "failed", lastError: message } }),
        prisma.referenceMaterial.update({
          where: { id: material.id },
          data: { parseStatus: "failed", lastError: `解析失败（已重试 ${attempts} 次）：${message}` }
        })
      ]);
      logger.error({ jobId, err: message }, "parse job permanently failed");
    }
  }
}

/** 原子认领一批待处理任务（updateMany 状态守卫，无需原生 SQL）。 */
export async function claimJobs(limit: number): Promise<string[]> {
  const candidates = await prisma.parseJob.findMany({
    where: { status: "queued", runAfter: { lte: new Date() } },
    orderBy: { createdAt: "asc" },
    take: limit * 2,
    select: { id: true }
  });
  const claimed: string[] = [];
  for (const c of candidates) {
    if (claimed.length >= limit) break;
    const res = await prisma.parseJob.updateMany({
      where: { id: c.id, status: "queued" },
      data: { status: "running", attempt: { increment: 1 } }
    });
    if (res.count === 1) claimed.push(c.id);
  }
  return claimed;
}

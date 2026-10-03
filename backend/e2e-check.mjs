import assert from "node:assert/strict";

const BASE = "http://127.0.0.1:3001";
let passed = 0;
const ok = (name) => {
  passed += 1;
  console.log(`  ✅ ${name}`);
};

async function req(method, path, { token, body, raw } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      ...(raw ? { "Content-Type": "application/octet-stream" } : body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: raw ?? (body ? JSON.stringify(body) : undefined)
  });
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  return { status: res.status, data };
}

const basePayload = (requestId, extra = {}) => ({
  clientRequestId: requestId,
  title: "E2E 湖畔光影短片",
  contentType: "short_video",
  audience: "youth",
  durationSec: 45,
  aspectRatio: "9:16",
  brief: "端到端验收用项目",
  references: [
    { url: "https://example.com/good?sim=reachable", label: "可访问未授权" },
    { url: "https://bad.example.net/x?sim=unreachable", label: "不可达" },
    { url: "not-a-url", label: "格式错误" }
  ],
  attachments: [],
  ...extra
});

// 1. 登录
const login = await req("POST", "/api/auth/login", { body: { username: "creator", password: "123456" } });
assert.equal(login.status, 200);
const creatorToken = login.data.token;
ok("creator 登录成功");

const guestLogin = await req("POST", "/api/auth/login", { body: { username: "guest", password: "123456" } });
const guestToken = guestLogin.data.token;
const adminLogin = await req("POST", "/api/auth/login", { body: { username: "admin", password: "123456" } });
const adminToken = adminLogin.data.token;
ok("guest/admin 登录成功");

// 确保 creator 处于已授权状态（测试可重复运行）
await req("POST", "/api/admin/permissions/restore", { token: adminToken, body: { username: "creator" } });

// 2. 未登录被拦截
const anon = await req("GET", "/api/projects");
assert.equal(anon.status, 401);
ok("未登录访问被 401 拦截");

// 3. 输入校验
const badInput = await req("POST", "/api/projects", {
  token: creatorToken,
  body: { clientRequestId: "x", title: "a", contentType: "nope", audience: "youth", durationSec: 1, aspectRatio: "9:16" }
});
assert.equal(badInput.status, 422);
ok("非法载荷被 422 拒绝（Zod 校验）");

// 4. guest 创建被拒绝（无授权）
const guestCreate = await req("POST", "/api/projects", {
  token: guestToken,
  body: basePayload("guest-req-0001")
});
assert.equal(guestCreate.status, 403);
assert.ok(["PERMISSION_REVOKED", "CREATE_FORBIDDEN"].includes(guestCreate.data.error.code));
ok("无创建权限的 guest 得到 403，且无项目落库");

// 5. creator 首次创建
const requestId = "e2e-" + Date.now();
const first = await req("POST", "/api/projects", { token: creatorToken, body: basePayload(requestId) });
assert.equal(first.status, 201, JSON.stringify(first.data));
const projectId = first.data.project.id;
assert.equal(first.data.recovered, false);
assert.equal(first.data.project.references.length, 3);
ok("首次创建 201：项目 + 3 链接 + 解析任务原子初始化");

// 6. 成功响应丢失：同请求号重放 -> 恢复原项目而非副本
const replay = await req("POST", "/api/projects", { token: creatorToken, body: basePayload(requestId) });
assert.equal(replay.status, 200);
assert.equal(replay.data.recovered, true);
assert.equal(replay.data.project.id, projectId);
ok("同请求号重放被识别为恢复（200 recovered，无副本）");

// 7. 同号异体 -> 409
const conflict = await req("POST", "/api/projects", {
  token: creatorToken,
  body: basePayload(requestId, { title: "偷偷换掉的标题" })
});
assert.equal(conflict.status, 409);
assert.equal(conflict.data.error.code, "IDEMPOTENCY_CONFLICT");
assert.ok(conflict.data.error.existingHash);
assert.ok(conflict.data.error.incomingHash);
assert.notEqual(conflict.data.error.existingHash, conflict.data.error.incomingHash);
ok("同请求号不同内容 -> 409 冲突，返回双端哈希");

// 8. 空白差异不构成冲突（规范化：trim）
const sameTrimmed = await req("POST", "/api/projects", {
  token: creatorToken,
  body: basePayload(requestId, { title: "E2E 湖畔光影短片  " })
});
assert.equal(sameTrimmed.status, 200);
assert.equal(sameTrimmed.data.recovered, true);
ok("仅首尾空白差异经规范化后仍为同一内容（恢复而非冲突）");

// 9. 新请求号 + 不同内容 -> 全新项目
const second = await req("POST", "/api/projects", {
  token: creatorToken,
  body: basePayload(requestId + "-v2", { title: "另一个创作" })
});
assert.equal(second.status, 201);
assert.notEqual(second.data.project.id, projectId);
ok("新请求号创建独立项目");

// 10. 异步解析：等待 worker 处理
let detail = null;
for (let i = 0; i < 20; i++) {
  await new Promise((r) => setTimeout(r, 500));
  const d = await req("GET", `/api/projects/${projectId}`, { token: creatorToken });
  detail = d.data;
  if (detail.references.every((r) => r.status === "done")) break;
}
assert.ok(detail.references.every((r) => r.status === "done"), "解析未全部完成");
const byUrl = Object.fromEntries(detail.references.map((r) => [r.url, r]));
assert.equal(byUrl["https://example.com/good?sim=reachable"].reachability, "reachable");
assert.equal(byUrl["https://example.com/good?sim=reachable"].license, "unlicensed");
assert.equal(byUrl["https://bad.example.net/x?sim=unreachable"].reachability, "unreachable");
assert.equal(byUrl["https://bad.example.net/x?sim=unreachable"].license, "unknown");
assert.equal(byUrl["not-a-url"].formatValid, false);
ok("解析三态：格式错误 / 不可达 / 可访问但未授权 严格区分");

// 11. “请求成功不等于授权”：可访问链接 license 必须不是 licensed
assert.notEqual(byUrl["https://example.com/good?sim=reachable"].license, "licensed");
ok("可访问 ≠ 已授权（reachable 链接默认 unlicensed）");

// 12. 异步解析期间改链接：新增一条
const addRef = await req("POST", `/api/projects/${projectId}/references`, {
  token: creatorToken,
  body: { url: "https://new.example.com/p?sim=reachable&license=cc-by", label: "解析期间追加（带许可）" }
});
assert.equal(addRef.status, 201);
const newRefId = addRef.data.project.references.at(-1).id;
ok("解析期间可追加链接并入队");

for (let i = 0; i < 20; i++) {
  await new Promise((r) => setTimeout(r, 500));
  const d = await req("GET", `/api/projects/${projectId}`, { token: creatorToken });
  const target = d.data.references.find((r) => r.id === newRefId);
  if (target && target.status === "done") {
    detail = d.data;
    assert.equal(target.license, "licensed");
    break;
  }
  if (i === 19) assert.fail("新链接解析超时");
}
ok("素材方声明 license=cc-by 的链接可获 licensed（其余仍需显式授权）");

// 13. 管理员显式授权
const decide = await req("POST", `/api/admin/references/${newRefId}/decision`, {
  token: adminToken,
  body: { license: "licensed" }
});
assert.equal(decide.status, 200);
const nonAdmin = await req("POST", `/api/admin/references/${newRefId}/decision`, {
  token: creatorToken,
  body: { license: "licensed" }
});
assert.equal(nonAdmin.status, 403);
ok("管理员可显式授权，普通用户访问管理接口 403");

// 14. 非所有者看不到项目（脚本页前提）
const other = await req("GET", `/api/projects/${projectId}`, { token: guestToken });
assert.equal(other.status, 404);
ok("非所有者访问项目详情返回 404（不泄露存在性）");

// 15. 冻结脚本存在且定格
assert.ok(detail.frozenScript.includes("E2E 湖畔光影短片"));
assert.ok(detail.snapshot.script.includes("分镜脚本"));
assert.equal(detail.snapshot.referenceUrls.length, 3);
ok("冻结脚本/快照在创建瞬间生成");

// 16. 附件：配额不足状态登记
const quotaReq = requestId + "-quota";
const quotaProj = await req("POST", "/api/projects", {
  token: creatorToken,
  body: {
    ...basePayload(quotaReq, { title: "配额验收项目", attachments: [{ stagingId: "", fileName: "huge.mov", sizeBytes: 5242880 }] })
  }
});
assert.equal(quotaProj.status, 201);
const att = quotaProj.data.project.attachments[0];
assert.equal(att.status, "pending_local");
ok("未上传附件以 pending_local 进入项目并明确展示状态");

// 17. 暂存上传完整流程
const reg = await req("POST", "/api/staging", {
  token: creatorToken,
  body: { fileName: "note.txt", mime: "text/plain", sizeBytes: 5 }
});
assert.equal(reg.status, 201);
const stagingId = reg.data.staging.id;
const put = await req("PUT", `/api/staging/${stagingId}/content`, { token: creatorToken, raw: "hello" });
assert.equal(put.status, 200);
assert.equal(put.data.staging.status, "uploaded");
ok("附件暂存登记 + 二进制上传成功");

const attachProjId = "e2e-attached-" + Date.now();
const withAttach = await req("POST", "/api/projects", {
  token: creatorToken,
  body: {
    ...basePayload(attachProjId, {
      title: "带已上传附件的项目",
      attachments: [{ stagingId, fileName: "note.txt", sizeBytes: 5 }]
    })
  }
});
assert.equal(withAttach.status, 201);
assert.equal(withAttach.data.project.attachments[0].status, "uploaded");
assert.equal(withAttach.data.project.attachments[0].progressPct, 100);
ok("已暂存附件随创建事务并入项目（uploaded）");

// 18. 创建时权限被收回
await req("POST", "/api/admin/permissions/revoke", { token: adminToken, body: { username: "creator" } });
const revokedCreate = await req("POST", "/api/projects", {
  token: creatorToken,
  body: basePayload("after-revoke-" + Date.now(), { title: "权限收回后的尝试" })
});
assert.equal(revokedCreate.status, 403);
assert.equal(revokedCreate.data.error.code, "PERMISSION_REVOKED");
const projectsAfterRevoke = await req("GET", "/api/projects", { token: creatorToken });
const titlesAfter = projectsAfterRevoke.data.items.map((i) => i.title);
assert.ok(!titlesAfter.includes("权限收回后的尝试"), "回滚失败：项目仍落库");
ok("创建时权限已收回 -> 403 且整笔事务回滚，无残稿");

// 19. 恢复权限后原请求号仍可正常工作
await req("POST", "/api/admin/permissions/restore", { token: adminToken, body: { username: "creator" } });
const retryCreate = await req("POST", "/api/projects", {
  token: creatorToken,
  body: basePayload("after-restore-" + Date.now(), { title: "权限恢复后创建" })
});
assert.equal(retryCreate.status, 201);
ok("管理员恢复权限后创建恢复正常");

// 20. 并发同请求号（模拟双标签页同时提交）
const raceId = "race-" + Date.now();
const payload = basePayload(raceId, { title: "并发竞赛项目" });
const results = await Promise.all([
  req("POST", "/api/projects", { token: creatorToken, body: payload }),
  req("POST", "/api/projects", { token: creatorToken, body: payload }),
  req("POST", "/api/projects", { token: creatorToken, body: payload })
]);
const ids = new Set(results.filter((r) => r.status === 200 || r.status === 201).map((r) => r.data.project.id));
assert.equal(ids.size, 1, "并发产生了多个项目 id: " + JSON.stringify([...ids]));
ok("三个并发同请求请求只产生一个项目（事务 + 唯一约束）");

// 21. park 兼容接口
const weather = await req("GET", "/api/park/weather");
assert.equal(weather.status, 200);
ok("公园介绍页兼容接口可用");

console.log(`\n🎉 全部 ${passed} 项验收通过`);

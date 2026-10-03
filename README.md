# 云溪公园 · 创作工坊（全栈项目创建向导）

公园简介站点 + 全栈内容创作平台。React 创建向导收集内容类型、受众、时长与画幅；
后端在单事务内完成草稿转化、权限校验与项目初始化；参考素材进入独立解析队列，
按「格式 / 可访问性 / 使用许可」三级校验（请求成功 ≠ 已授权）。

## 🛠 技术栈
- Frontend: React 18 + TypeScript + Vite 5 + Tailwind CSS 3 + Zustand + React Router + Zod
- Backend: Node.js 20 + Express + Prisma ORM + Pino（结构化日志）+ Zod
- Worker: 独立解析队列进程（同事务发件箱 + 版本护栏）
- Database: PostgreSQL 16（Docker Volume 持久化）

## 🚀 启动指南 (How to Run)
1. 确保 Docker Desktop 已启动。
2. 在根目录执行：`docker compose up --build`
3. 等待容器启动完成（backend 会自动执行数据库迁移与种子数据）后访问 `http://localhost:3000`

## 🔗 服务地址 (Services)
- Frontend: http://localhost:3000 （创作向导 `/create`，项目列表 `/projects`）
- Backend API: http://localhost:8000/api （健康检查 `/api/health`）
- Database: localhost:5432（user: park / pass: park / db: park）

## 🧪 测试账号
- Admin: admin / 123456（管理员，可在向导页「验收演示工具」中收回/恢复创建权限）
- Creator: creator / 123456（普通创作者）
- Guest: guest / 123456（已被收回创建权限，用于验收 403 场景）

## ✅ 验收场景速查
| 场景 | 操作路径 |
|------|----------|
| 幂等创建 | 创建项目后在「验收演示工具」点「重放创建请求」→ 返回原项目；点「篡改请求内容」→ 409 |
| 多标签页/断网重复创建 | 两个标签页同时创建同一草稿 → 只生成一个项目；断网点击创建 → 离线队列，联网自动提交且不重复 |
| 创建时权限被收回 | 向导页演示工具收回权限 → 创建返回 403；恢复后可原样重试 |
| 异步解析期间改链接 | 项目脚本页 → 素材「修改链接」→ 版本 +1 重新解析，旧结果作废 |
| 附件仍上传中 | 上传大文件后立刻创建 → 项目带「上传中」附件，完成后自动变「已上传」 |
| 浏览器配额不足 | 自动降级为内存模式 + 横幅提示，直接同步服务器 |
| 冻结摘要 | 脚本页摘要只读，带「已冻结」标记 |
| 清除本机草稿 | 演示工具「清除本机草稿」→ 仅删本机，服务器草稿可「从服务器恢复」，项目不受影响 |

详细设计见 [docs/design.md](docs/design.md)（草稿身份与幂等、本地先写 vs 服务器先建对比、三级链接校验）。

---

## 🐳 Docker 镜像源配置 (Docker Registry Configuration)

### 推荐配置（基于实际项目验证）

#### 1. Docker 镜像源
**使用官方 Docker Hub 镜像**（已验证稳定可用）

```yaml
# docker-compose.yml 示例
services:
  db:
    image: postgres:16-alpine               # PostgreSQL 数据库
  backend:
    build: ./backend
    # Dockerfile 中使用：node:20-slim（构建 + 运行）
  frontend:
    build: ./frontend
    # Dockerfile 中使用：
    # - node:20-alpine (构建)
    # - nginx:alpine (运行)
```

#### 2. npm 依赖源
**使用淘宝镜像**（国内访问快）

在 `Dockerfile` 中添加：
```dockerfile
RUN npm config set registry https://registry.npmmirror.com
```

### 常用镜像推荐

| 技术栈 | 推荐镜像 | 说明 |
|--------|---------|------|
| PostgreSQL | `postgres:16-alpine` | 数据库 |
| Node.js | `node:20-slim` | 后端构建/运行（Prisma 需要 openssl） |
| Node.js | `node:20-alpine` | 前端构建 |
| Nginx | `nginx:alpine` | 前端生产环境 |

### 使用建议
1. ✅ **优先使用官方镜像**：稳定可靠，无需配置镜像代理
2. ✅ **使用 Alpine 版本**：镜像体积小，构建速度快（后端因 Prisma 依赖 openssl 使用 slim）
3. ✅ **配置 npm 淘宝源**：加速国内依赖下载
4. ✅ **多阶段构建**：减小最终镜像体积

### 常见问题

**Q: Docker 镜像拉取失败？**  
A: 检查网络连接，确保 Docker Desktop 正常运行

**Q: npm install 很慢？**  
A: 确保已配置淘宝镜像源：`npm config set registry https://registry.npmmirror.com`

**Q: 数据库连接失败？**  
A: backend 通过 compose 健康检查等待 db 就绪；首次启动迁移约需 10-20 秒

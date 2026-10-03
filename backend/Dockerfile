# 构建阶段：安装依赖、生成 Prisma Client、编译 TypeScript
FROM node:20-slim AS builder
WORKDIR /app
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm config set registry https://registry.npmmirror.com && npm ci
COPY prisma ./prisma
RUN npx prisma generate
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# 运行阶段
FROM node:20-slim
WORKDIR /app
ENV NODE_ENV=production
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm config set registry https://registry.npmmirror.com && npm ci --omit=dev
# Prisma Client 生成产物从构建阶段复制（postinstall 在无 schema 时不会重新生成）
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/dist ./dist
COPY prisma ./prisma
EXPOSE 8000
# 默认启动 API（先迁移、再种子、后服务）；worker 服务在 compose 中覆盖 command
CMD ["sh", "-c", "node_modules/.bin/prisma migrate deploy && node dist/seed.js && node dist/index.js"]

import type { FastifyInstance } from "fastify";

/** 兼容既有公园介绍页（Trae 预览）的只读演示接口 */
export async function parkRoutes(app: FastifyInstance): Promise<void> {
  app.get("/park/highlights", async (_request, reply) => {
    return reply.send([
      { title: "湖光栈道", desc: "1.6km 环湖漫步，沉浸水雾与灯光艺术。", tag: "夜游首选" },
      { title: "云顶草坡", desc: "18° 坡度草坪，适合露营、飞盘与日落音乐。", tag: "轻野营" },
      { title: "森林书屋", desc: "原木阅读空间，精选自然主题阅读与咖啡。", tag: "静心角" }
    ]);
  });

  app.get("/park/weather", async (_request, reply) => {
    return reply.send({ feel: "21°C · 微风", humidity: 63, advise: "湖区湿度适中，11:00-15:00 适合步行创作。" });
  });
}

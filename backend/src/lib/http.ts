import type { FastifyReply } from "fastify";

export function sendError(reply: FastifyReply, status: number, code: string, message: string, extra?: Record<string, unknown>) {
  return reply.status(status).send({ error: { code, message, ...extra } });
}

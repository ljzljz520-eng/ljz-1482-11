export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export const badRequest = (code: string, message: string, details?: unknown) =>
  new ApiError(400, code, message, details);
export const unauthorized = (message = "未登录或登录已过期") => new ApiError(401, "UNAUTHORIZED", message);
export const forbidden = (code: string, message: string) => new ApiError(403, code, message);
export const notFound = (code: string, message: string) => new ApiError(404, code, message);
export const conflict = (code: string, message: string, details?: unknown) =>
  new ApiError(409, code, message, details);

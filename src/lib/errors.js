export class AppError extends Error {
  constructor(status, code, message, details = undefined) {
    super(message);
    this.name = "AppError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function assertAppError(error) {
  if (error instanceof AppError) return error;
  return new AppError(500, "internal_error", "Internal server error");
}

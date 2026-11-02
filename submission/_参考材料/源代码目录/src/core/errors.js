export class AppError extends Error {
  constructor(code, message, { status = 400, details = {} } = {}) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export function badRequest(message, details = {}) {
  return new AppError("BAD_REQUEST", message, { status: 400, details });
}

export function forbidden(message, details = {}) {
  return new AppError("FORBIDDEN", message, { status: 403, details });
}

export function notFound(message, details = {}) {
  return new AppError("NOT_FOUND", message, { status: 404, details });
}

export function conflict(message, details = {}) {
  return new AppError("CONFLICT", message, { status: 409, details });
}

const STATUS_BY_CODE = {
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  VALIDATION_ERROR: 422,
  PAYLOAD_TOO_LARGE: 413,
  INTERNAL_ERROR: 500,
} as const;

export type ErrorCode = keyof typeof STATUS_BY_CODE;

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details?: unknown;

  constructor(code: ErrorCode, message: string, details?: unknown) {
    super(message);
    this.code = code;
    this.status = STATUS_BY_CODE[code];
    this.details = details;
  }
}

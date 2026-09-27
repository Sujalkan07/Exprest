import { ApiErrorResponse, ErrorCode } from '@exprest/types';

export class AppError extends Error {
  public readonly code: ErrorCode;
  public readonly statusCode: number;
  public readonly retryable: boolean;

  constructor(code: ErrorCode, message: string, statusCode = 400, retryable = false) {
    super(message);
    this.code = code;
    this.statusCode = statusCode;
    this.retryable = retryable;
    Object.setPrototypeOf(this, new.target.prototype);
  }

  toResponse(requestId: string): ApiErrorResponse {
    return {
      error: {
        code: this.code,
        message: this.message,
        retryable: this.retryable,
      },
      meta: {
        requestId,
        generatedAt: new Date().toISOString(),
      },
    };
  }
}

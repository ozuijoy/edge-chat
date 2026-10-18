export class ApiError extends Error {
  constructor(message, status = 400, code = 'invalid_request') {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}


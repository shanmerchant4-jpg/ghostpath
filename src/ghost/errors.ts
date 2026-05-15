export interface GhostErrorOptions {
  code: string;
  message: string;
  hint: string;
}

export class GhostError extends Error {
  readonly code: string;
  readonly hint: string;

  constructor({ code, message, hint }: GhostErrorOptions) {
    super(message);
    this.name = 'GhostError';
    this.code = code;
    this.hint = hint;
  }
}

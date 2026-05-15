export class GhostError extends Error {
    code;
    hint;
    constructor({ code, message, hint }) {
        super(message);
        this.name = 'GhostError';
        this.code = code;
        this.hint = hint;
    }
}

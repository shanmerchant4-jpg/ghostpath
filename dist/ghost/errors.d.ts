export interface GhostErrorOptions {
    code: string;
    message: string;
    hint: string;
}
export declare class GhostError extends Error {
    readonly code: string;
    readonly hint: string;
    constructor({ code, message, hint }: GhostErrorOptions);
}

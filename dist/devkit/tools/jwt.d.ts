export declare function decodeJwt(token: string): {
    header: object;
    payload: object;
    isExpired: boolean;
    expiresAt?: Date;
    error?: string;
};

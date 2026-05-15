export declare function startProxy(domain: string, port: number): Promise<void>;
export declare function stopProxy(domain: string): Promise<void>;
/** Returns the port a domain is currently proxied to, or undefined if not active. */
export declare function getProxyPort(domain: string): number | undefined;

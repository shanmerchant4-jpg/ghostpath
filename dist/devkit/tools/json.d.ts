export declare function formatJson(input: string): string;
export declare function minifyJson(input: string): string;
export declare function validateJson(input: string): {
    valid: boolean;
    error?: string;
};
export declare function jsonToTsTypes(input: string): string;
export declare function jsonToZodSchema(input: string): string;

export declare function testRegex(pattern: string, flags: string, input: string): {
    matches: RegExpMatchArray[];
    isValid: boolean;
    error?: string;
};
export declare function explainRegex(pattern: string): string;

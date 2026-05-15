export type DiffLine = {
    type: 'added' | 'removed' | 'unchanged';
    content: string;
};
export declare function diffText(a: string, b: string): DiffLine[];

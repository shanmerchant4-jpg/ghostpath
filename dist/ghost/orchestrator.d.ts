export interface ProjectEntry {
    name: string;
    path: string;
}
export interface Ghostfile {
    name: string;
    start: string[];
    domain?: string;
    port?: number;
    open?: string[];
    models?: string[];
    env?: string;
    trace?: boolean;
    resources?: {
        maxMemoryMB?: number;
        idleKillMinutes?: number;
    };
}
export interface OpenResult {
    projectName: string;
    pids: number[];
    commandCount: number;
}
export interface OpenOptions {
    hookArgs?: string[];
}
export declare function findProject(name: string): Promise<ProjectEntry>;
export declare function readGhostfile(projectPath: string): Promise<Ghostfile>;
export declare function openProject(name: string, options?: OpenOptions): Promise<OpenResult>;
export declare function stopProject(name: string, options?: {
    skipCountdown?: boolean;
}): Promise<void>;
export interface ProjectWithStatus extends ProjectEntry {
    domain?: string;
    port?: number;
    running: boolean;
}
export declare function listProjects(): Promise<ProjectWithStatus[]>;

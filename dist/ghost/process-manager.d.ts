export interface ProcessState {
    pids: number[];
    startedAt: string;
    cwd: string;
    commands: string[];
}
export declare function spawnCommands(projectName: string, commands: string[], cwd: string, envVars?: Record<string, string>): Promise<number[]>;
export declare function stopProject(projectName: string, options?: {
    skipCountdown?: boolean;
}): Promise<void>;
export declare function isProjectRunning(projectName: string): Promise<boolean>;
export declare function getProjectState(projectName: string): Promise<ProcessState | null>;
export declare function getAllRunningProjects(): Promise<string[]>;

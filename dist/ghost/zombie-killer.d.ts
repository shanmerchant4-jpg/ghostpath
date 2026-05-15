export declare function registerProcess(pid: number): void;
export declare function unregisterProcess(pid: number): void;
export declare function recordIO(pid: number): void;
export declare function runZombieCheck(idleThresholdMinutes: number): Promise<number[]>;
export declare function killZombies(pids: number[], autoMode: boolean): Promise<void>;

import { EventEmitter } from 'node:events';
export interface ResourceSnapshot {
    timestamp: number;
    cpuPercent: number;
    ramUsedMB: number;
    ramTotalMB: number;
}
declare class ResourceMonitor extends EventEmitter {
    private readonly ring;
    private ringWrite;
    private ringCount;
    private timer;
    private prevCpuSamples;
    constructor();
    private sampleCpu;
    private calcCpuPercent;
    private addSnapshot;
    private poll;
    start(): void;
    stop(): void;
    getHistory(): ResourceSnapshot[];
}
export declare const resourceMonitor: ResourceMonitor;
export declare function startMonitor(): void;
export declare function stopMonitor(): void;
export declare function getHistory(): ResourceSnapshot[];
export {};

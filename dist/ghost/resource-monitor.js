import { EventEmitter } from 'node:events';
import os from 'node:os';
import { GhostError } from './errors.js';
const RING_SIZE = 60;
const POLL_INTERVAL_MS = 5000;
const CPU_HIGH_THRESHOLD = 85;
const RAM_HIGH_THRESHOLD = 90;
class ResourceMonitor extends EventEmitter {
    ring;
    ringWrite;
    ringCount;
    timer;
    prevCpuSamples;
    constructor() {
        super();
        this.ring = new Array(RING_SIZE).fill(null);
        this.ringWrite = 0;
        this.ringCount = 0;
        this.timer = null;
        this.prevCpuSamples = null;
    }
    sampleCpu() {
        return os.cpus().map((cpu) => {
            const { user, nice, sys, idle, irq } = cpu.times;
            return { idle, total: user + nice + sys + idle + irq };
        });
    }
    calcCpuPercent(prev, curr) {
        let idleDelta = 0;
        let totalDelta = 0;
        const len = Math.min(prev.length, curr.length);
        for (let i = 0; i < len; i++) {
            idleDelta += (curr[i]?.idle ?? 0) - (prev[i]?.idle ?? 0);
            totalDelta += (curr[i]?.total ?? 0) - (prev[i]?.total ?? 0);
        }
        if (totalDelta === 0)
            return 0;
        return Math.max(0, Math.min(100, (1 - idleDelta / totalDelta) * 100));
    }
    addSnapshot(snapshot) {
        this.ring[this.ringWrite] = snapshot;
        this.ringWrite = (this.ringWrite + 1) % RING_SIZE;
        if (this.ringCount < RING_SIZE)
            this.ringCount++;
    }
    poll() {
        const currCpu = this.sampleCpu();
        let cpuPercent = 0;
        if (this.prevCpuSamples !== null) {
            cpuPercent = this.calcCpuPercent(this.prevCpuSamples, currCpu);
        }
        this.prevCpuSamples = currCpu;
        const totalMem = os.totalmem();
        const usedMem = totalMem - os.freemem();
        const snapshot = {
            timestamp: Date.now(),
            cpuPercent: Math.round(cpuPercent * 10) / 10,
            ramUsedMB: Math.round(usedMem / 1024 / 1024),
            ramTotalMB: Math.round(totalMem / 1024 / 1024),
        };
        this.addSnapshot(snapshot);
        this.emit('snapshot', snapshot);
        if (cpuPercent > CPU_HIGH_THRESHOLD) {
            this.emit('cpu-high', snapshot);
        }
        const ramPercent = (usedMem / totalMem) * 100;
        if (ramPercent > RAM_HIGH_THRESHOLD) {
            this.emit('ram-high', snapshot);
        }
    }
    start() {
        if (this.timer !== null) {
            throw new GhostError({
                code: 'MONITOR_ALREADY_RUNNING',
                message: 'Resource monitor is already running',
                hint: 'Call stopMonitor() before starting again',
            });
        }
        this.prevCpuSamples = this.sampleCpu();
        this.timer = setInterval(() => {
            this.poll();
        }, POLL_INTERVAL_MS);
    }
    stop() {
        if (this.timer === null)
            return;
        clearInterval(this.timer);
        this.timer = null;
        this.prevCpuSamples = null;
    }
    getHistory() {
        if (this.ringCount === 0)
            return [];
        const result = [];
        if (this.ringCount < RING_SIZE) {
            for (let i = 0; i < this.ringCount; i++) {
                const snap = this.ring[i];
                if (snap !== null)
                    result.push(snap);
            }
        }
        else {
            for (let i = 0; i < RING_SIZE; i++) {
                const snap = this.ring[(this.ringWrite + i) % RING_SIZE];
                if (snap !== null)
                    result.push(snap);
            }
        }
        return result;
    }
}
export const resourceMonitor = new ResourceMonitor();
export function startMonitor() {
    resourceMonitor.start();
}
export function stopMonitor() {
    resourceMonitor.stop();
}
export function getHistory() {
    return resourceMonitor.getHistory();
}

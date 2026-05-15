import { EventEmitter } from 'node:events';
import os from 'node:os';
import { GhostError } from './errors.js';

export interface ResourceSnapshot {
  timestamp: number;
  cpuPercent: number;
  ramUsedMB: number;
  ramTotalMB: number;
}

const RING_SIZE = 60;
const POLL_INTERVAL_MS = 5000;
const CPU_HIGH_THRESHOLD = 85;
const RAM_HIGH_THRESHOLD = 90;

interface CpuSample {
  idle: number;
  total: number;
}

class ResourceMonitor extends EventEmitter {
  private readonly ring: Array<ResourceSnapshot | null>;
  private ringWrite: number;
  private ringCount: number;
  private timer: ReturnType<typeof setInterval> | null;
  private prevCpuSamples: CpuSample[] | null;

  constructor() {
    super();
    this.ring = new Array<ResourceSnapshot | null>(RING_SIZE).fill(null);
    this.ringWrite = 0;
    this.ringCount = 0;
    this.timer = null;
    this.prevCpuSamples = null;
  }

  private sampleCpu(): CpuSample[] {
    return os.cpus().map((cpu) => {
      const { user, nice, sys, idle, irq } = cpu.times;
      return { idle, total: user + nice + sys + idle + irq };
    });
  }

  private calcCpuPercent(prev: CpuSample[], curr: CpuSample[]): number {
    let idleDelta = 0;
    let totalDelta = 0;
    const len = Math.min(prev.length, curr.length);

    for (let i = 0; i < len; i++) {
      idleDelta += (curr[i]?.idle ?? 0) - (prev[i]?.idle ?? 0);
      totalDelta += (curr[i]?.total ?? 0) - (prev[i]?.total ?? 0);
    }

    if (totalDelta === 0) return 0;
    return Math.max(0, Math.min(100, (1 - idleDelta / totalDelta) * 100));
  }

  private addSnapshot(snapshot: ResourceSnapshot): void {
    this.ring[this.ringWrite] = snapshot;
    this.ringWrite = (this.ringWrite + 1) % RING_SIZE;
    if (this.ringCount < RING_SIZE) this.ringCount++;
  }

  private poll(): void {
    const currCpu = this.sampleCpu();

    let cpuPercent = 0;
    if (this.prevCpuSamples !== null) {
      cpuPercent = this.calcCpuPercent(this.prevCpuSamples, currCpu);
    }
    this.prevCpuSamples = currCpu;

    const totalMem = os.totalmem();
    const usedMem = totalMem - os.freemem();

    const snapshot: ResourceSnapshot = {
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

  start(): void {
    if (this.timer !== null) {
      throw new GhostError({
        code: 'MONITOR_ALREADY_RUNNING',
        message: 'Resource monitor is already running',
        hint: 'Call stopMonitor() before starting again',
      });
    }
    this.prevCpuSamples = this.sampleCpu();
    this.timer = setInterval(() => {
      // Fault isolation: a single poll failure (e.g. a throwing snapshot listener) must
      // not stop the monitor — log and continue so the ring buffer keeps filling.
      try {
        this.poll();
      } catch (err) {
        console.error(`[resource-monitor] poll error: ${err instanceof Error ? err.message : String(err)}`);
      }
    }, POLL_INTERVAL_MS);
  }

  stop(): void {
    if (this.timer === null) return;
    clearInterval(this.timer);
    this.timer = null;
    this.prevCpuSamples = null;
  }

  getHistory(): ResourceSnapshot[] {
    if (this.ringCount === 0) return [];

    const result: ResourceSnapshot[] = [];

    if (this.ringCount < RING_SIZE) {
      for (let i = 0; i < this.ringCount; i++) {
        const snap = this.ring[i];
        if (snap !== null) result.push(snap);
      }
    } else {
      for (let i = 0; i < RING_SIZE; i++) {
        const snap = this.ring[(this.ringWrite + i) % RING_SIZE];
        if (snap !== null) result.push(snap);
      }
    }

    return result;
  }
}

export const resourceMonitor = new ResourceMonitor();

export function startMonitor(): void {
  resourceMonitor.start();
}

export function stopMonitor(): void {
  resourceMonitor.stop();
}

export function getHistory(): ResourceSnapshot[] {
  return resourceMonitor.getHistory();
}

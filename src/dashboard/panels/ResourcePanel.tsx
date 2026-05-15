import { useEffect, useRef, useState } from 'react';
import gsap from 'gsap';
import { onMessage } from '../ws';

interface ResourceSnapshot {
  timestamp: number;
  cpuPercent: number;
  ramUsedMB: number;
  ramTotalMB: number;
  gpuPercent?: number;
}

const MAX_HISTORY = 60;
const SPARKLINE_W = 280;
const SPARKLINE_H = 36;

function buildSparklinePath(
  data: ResourceSnapshot[],
  accessor: (s: ResourceSnapshot) => number,
): string {
  if (data.length < 2) return '';
  const step = SPARKLINE_W / (data.length - 1);
  return data
    .map((s, i) => {
      const x = (i * step).toFixed(1);
      const y = (SPARKLINE_H - (accessor(s) / 100) * SPARKLINE_H).toFixed(1);
      return `${i === 0 ? 'M' : 'L'}${x},${y}`;
    })
    .join(' ');
}

function Bar({
  barRef,
  label,
  value,
  detail,
  color,
  history,
  accessor,
}: {
  barRef: React.RefObject<HTMLDivElement | null>;
  label: string;
  value: number;
  detail: string;
  color: string;
  history: ResourceSnapshot[];
  accessor: (s: ResourceSnapshot) => number;
}) {
  return (
    <div>
      <div className="flex justify-between mb-1" style={{ fontSize: 12 }}>
        <span style={{ color: '#9ca3af' }}>{label}</span>
        <span style={{ color: '#e5e5e5' }}>
          {value.toFixed(1)}%{detail ? ` — ${detail}` : ''}
        </span>
      </div>
      <div
        className="rounded-full overflow-hidden"
        style={{ height: 6, background: '#2a2a2a' }}
      >
        <div
          ref={barRef}
          className="h-full rounded-full"
          style={{ width: '0%', background: color }}
        />
      </div>
      <svg
        width={SPARKLINE_W}
        height={SPARKLINE_H}
        viewBox={`0 0 ${SPARKLINE_W} ${SPARKLINE_H}`}
        className="mt-2 opacity-60"
      >
        <path
          d={buildSparklinePath(history, accessor)}
          fill="none"
          stroke={color}
          strokeWidth={1.5}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      </svg>
    </div>
  );
}

export default function ResourcePanel() {
  const [latest, setLatest] = useState<ResourceSnapshot | null>(null);
  const [history, setHistory] = useState<ResourceSnapshot[]>([]);
  const cpuBarRef = useRef<HTMLDivElement | null>(null);
  const ramBarRef = useRef<HTMLDivElement | null>(null);
  const gpuBarRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    return onMessage((type, payload) => {
      if (type === 'resource:snapshot') {
        const snap = payload as ResourceSnapshot;
        setLatest(snap);
        setHistory((prev) => [...prev.slice(-(MAX_HISTORY - 1)), snap]);
      }
    });
  }, []);

  useEffect(() => {
    if (latest === null) return;

    const animate = (ref: React.RefObject<HTMLDivElement | null>, pct: number) => {
      if (ref.current === null) return;
      gsap.killTweensOf(ref.current);
      gsap.to(ref.current, { width: `${pct}%`, duration: 0.4, ease: 'power2.out' });
    };

    animate(cpuBarRef, latest.cpuPercent);
    animate(ramBarRef, (latest.ramUsedMB / latest.ramTotalMB) * 100);
    if (latest.gpuPercent !== undefined) {
      animate(gpuBarRef, latest.gpuPercent);
    }
  }, [latest]);

  useEffect(() => {
    return () => {
      if (cpuBarRef.current !== null) gsap.killTweensOf(cpuBarRef.current);
      if (ramBarRef.current !== null) gsap.killTweensOf(ramBarRef.current);
      if (gpuBarRef.current !== null) gsap.killTweensOf(gpuBarRef.current);
    };
  }, []);

  if (latest === null) {
    return (
      <div>
        <h1 className="text-base font-semibold mb-4">Resources</h1>
        <p style={{ color: '#6b7280', fontSize: 13 }}>Waiting for resource data…</p>
      </div>
    );
  }

  const ramPct = (latest.ramUsedMB / latest.ramTotalMB) * 100;

  return (
    <div>
      <h1 className="text-base font-semibold mb-6">Resources</h1>
      <div className="flex flex-col gap-8">
        <Bar
          barRef={cpuBarRef}
          label="CPU"
          value={latest.cpuPercent}
          detail=""
          color="#7c3aed"
          history={history}
          accessor={(s) => s.cpuPercent}
        />
        <Bar
          barRef={ramBarRef}
          label="RAM"
          value={ramPct}
          detail={`${latest.ramUsedMB} MB / ${latest.ramTotalMB} MB`}
          color="#059669"
          history={history}
          accessor={(s) => (s.ramUsedMB / s.ramTotalMB) * 100}
        />
        {latest.gpuPercent !== undefined && (
          <Bar
            barRef={gpuBarRef}
            label="GPU"
            value={latest.gpuPercent}
            detail=""
            color="#d97706"
            history={history}
            accessor={(s) => s.gpuPercent ?? 0}
          />
        )}
      </div>
    </div>
  );
}

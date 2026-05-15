import { useEffect, useRef, useState } from 'react';
import gsap from 'gsap';
import { type ConnectionState, onConnectionState } from './ws';
import ProjectPanel from './panels/ProjectPanel';
import ResourcePanel from './panels/ResourcePanel';
import DevKitPanel from './panels/DevKitPanel';
import TracePanel from './panels/TracePanel';

type Panel = 'projects' | 'resources' | 'devkit' | 'trace';

const NAV_ITEMS: Array<{ id: Panel; label: string }> = [
  { id: 'projects', label: 'Projects' },
  { id: 'resources', label: 'Resources' },
  { id: 'devkit', label: 'DevKit' },
  { id: 'trace', label: 'Trace' },
];

export default function App() {
  const [activePanel, setActivePanel] = useState<Panel>('projects');
  const [connState, setConnState] = useState<ConnectionState>('connecting');
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    return onConnectionState(setConnState);
  }, []);

  useEffect(() => {
    if (panelRef.current === null) return;
    const el = panelRef.current;
    gsap.killTweensOf(el);
    gsap.fromTo(el, { x: 20, opacity: 0 }, { x: 0, opacity: 1, duration: 0.25, ease: 'power2.out' });
    return () => {
      gsap.killTweensOf(el);
    };
  }, [activePanel]);

  const dotColor =
    connState === 'connected' ? '#22c55e' :
    connState === 'connecting' ? '#eab308' : '#ef4444';

  return (
    <div className="flex h-full" style={{ background: 'var(--bg)', color: 'var(--text)' }}>
      <aside
        className="flex flex-col gap-1 p-4 shrink-0"
        style={{ background: 'var(--surface)', width: 200, borderRight: '1px solid #2a2a2a' }}
      >
        <div className="text-xs font-bold tracking-widest mb-4 uppercase" style={{ color: 'var(--accent)' }}>
          GhostPath
        </div>

        {NAV_ITEMS.map((item) => (
          <button
            key={item.id}
            onClick={() => setActivePanel(item.id)}
            className="text-left px-3 py-2 rounded text-sm transition-colors cursor-pointer"
            style={{
              background: activePanel === item.id ? 'var(--accent)' : 'transparent',
              color: activePanel === item.id ? '#fff' : '#9ca3af',
            }}
            onMouseEnter={(e) => {
              if (activePanel !== item.id) {
                (e.currentTarget as HTMLElement).style.color = '#e5e5e5';
              }
            }}
            onMouseLeave={(e) => {
              if (activePanel !== item.id) {
                (e.currentTarget as HTMLElement).style.color = '#9ca3af';
              }
            }}
          >
            {item.label}
          </button>
        ))}

        <div className="mt-auto flex items-center gap-2" style={{ fontSize: 11, color: '#6b7280' }}>
          <div
            style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: dotColor,
              flexShrink: 0,
            }}
          />
          {connState}
        </div>
      </aside>

      <main className="flex-1 overflow-auto p-6">
        <div ref={panelRef}>
          {activePanel === 'projects' && <ProjectPanel />}
          {activePanel === 'resources' && <ResourcePanel />}
          {activePanel === 'devkit' && <DevKitPanel />}
          {activePanel === 'trace' && <TracePanel />}
        </div>
      </main>
    </div>
  );
}

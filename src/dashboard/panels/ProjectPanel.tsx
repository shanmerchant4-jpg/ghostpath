import { useEffect, useRef, useState } from 'react';
import gsap from 'gsap';
import { onMessage, send } from '../ws';

interface ProjectInfo {
  name: string;
  domain?: string;
  port?: number;
  running: boolean;
}

export default function ProjectPanel() {
  const [projects, setProjects] = useState<ProjectInfo[]>([]);
  const dotRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  useEffect(() => {
    return onMessage((type, payload) => {
      if (type === 'project:list') {
        setProjects(payload as ProjectInfo[]);
      }
    });
  }, []);

  useEffect(() => {
    for (const [name, el] of dotRefs.current) {
      const project = projects.find((p) => p.name === name);
      gsap.killTweensOf(el);
      if (project?.running === true) {
        gsap.to(el, { scale: 1.4, duration: 0.6, repeat: -1, yoyo: true, ease: 'power1.inOut' });
      } else {
        gsap.set(el, { scale: 1 });
      }
    }
    return () => {
      for (const el of dotRefs.current.values()) {
        gsap.killTweensOf(el);
      }
    };
  }, [projects]);

  return (
    <div>
      <h1 className="text-base font-semibold mb-4">Projects</h1>

      {projects.length === 0 ? (
        <p style={{ color: '#6b7280', fontSize: 13 }}>
          No projects registered. Run <code>ghostpath add &lt;path&gt;</code> to add one.
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {projects.map((project) => (
            <div
              key={project.name}
              className="rounded-lg p-4 flex items-center justify-between"
              style={{ background: 'var(--surface)', border: '1px solid #2a2a2a' }}
            >
              <div className="flex items-center gap-3">
                <div
                  ref={(el) => {
                    if (el !== null) dotRefs.current.set(project.name, el);
                    else dotRefs.current.delete(project.name);
                  }}
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: '50%',
                    background: project.running ? '#22c55e' : '#374151',
                    flexShrink: 0,
                    transformOrigin: 'center',
                  }}
                />
                <div>
                  <div className="font-medium" style={{ fontSize: 13 }}>
                    {project.name}
                  </div>
                  <div style={{ fontSize: 11, color: '#6b7280' }}>
                    {[project.domain, project.port ? `:${project.port}` : '']
                      .filter(Boolean)
                      .join('')}
                  </div>
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => send('project:open', { name: project.name })}
                  disabled={project.running}
                  className="px-3 py-1 rounded text-xs transition-colors"
                  style={{
                    background: project.running ? '#374151' : 'var(--accent)',
                    color: project.running ? '#6b7280' : '#fff',
                    cursor: project.running ? 'not-allowed' : 'pointer',
                    border: 'none',
                  }}
                >
                  Open
                </button>
                <button
                  onClick={() => send('project:stop', { name: project.name })}
                  disabled={!project.running}
                  className="px-3 py-1 rounded text-xs transition-colors"
                  style={{
                    background: '#1f2937',
                    color: project.running ? '#e5e5e5' : '#6b7280',
                    cursor: project.running ? 'pointer' : 'not-allowed',
                    border: '1px solid #374151',
                  }}
                >
                  Stop
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

import { WebSocketServer, WebSocket } from 'ws';
import { resourceMonitor, startMonitor, getHistory } from './resource-monitor.js';
import { openProject, stopProject, listProjects } from './orchestrator.js';
import { GhostError } from './errors.js';
const WS_PORT = 7071;
let wss = null;
let snapshotListener = null;
function broadcast(msg) {
    if (wss === null)
        return;
    const json = JSON.stringify(msg);
    for (const client of wss.clients) {
        if (client.readyState === WebSocket.OPEN) {
            client.send(json);
        }
    }
}
async function sendProjectList(ws) {
    const projects = await listProjects();
    if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'project:list', payload: projects }));
    }
}
async function broadcastProjectList() {
    if (wss === null)
        return;
    const projects = await listProjects();
    const json = JSON.stringify({ type: 'project:list', payload: projects });
    for (const client of wss.clients) {
        if (client.readyState === WebSocket.OPEN) {
            client.send(json);
        }
    }
}
function handleMessage(ws, raw) {
    let msg;
    try {
        msg = JSON.parse(raw);
    }
    catch {
        return;
    }
    const sendError = (message) => {
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'error', payload: { message } }));
        }
    };
    if (msg.type === 'project:open') {
        const payload = msg.payload;
        void openProject(payload.name)
            .then(() => broadcastProjectList())
            .catch((err) => {
            sendError(err instanceof GhostError ? err.message : String(err));
        });
        return;
    }
    if (msg.type === 'project:stop') {
        const payload = msg.payload;
        void stopProject(payload.name, { skipCountdown: true })
            .then(() => broadcastProjectList())
            .catch((err) => {
            sendError(err instanceof GhostError ? err.message : String(err));
        });
        return;
    }
}
export function startWsServer() {
    if (wss !== null)
        return;
    const server = new WebSocketServer({ port: WS_PORT });
    server.on('error', (err) => {
        if (err.code === 'EADDRINUSE') {
            // Port already in use — another ghostpath process owns the WS server, that's fine
            wss = null;
            return;
        }
        throw new GhostError({
            code: 'WS_SERVER_FAILED',
            message: `WebSocket server failed: ${err.message}`,
            hint: 'Check if another process is using port 7071',
        });
    });
    wss = server;
    try {
        startMonitor();
    }
    catch {
        // already running
    }
    snapshotListener = (snap) => {
        broadcast({ type: 'resource:snapshot', payload: snap });
    };
    resourceMonitor.on('snapshot', snapshotListener);
    wss.on('connection', (ws) => {
        void sendProjectList(ws);
        const history = getHistory();
        const latest = history[history.length - 1];
        if (latest !== undefined && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'resource:snapshot', payload: latest }));
        }
        ws.on('message', (data) => {
            handleMessage(ws, data.toString());
        });
    });
}
export function stopWsServer() {
    if (wss === null)
        return;
    if (snapshotListener !== null) {
        resourceMonitor.off('snapshot', snapshotListener);
        snapshotListener = null;
    }
    wss.close();
    wss = null;
}

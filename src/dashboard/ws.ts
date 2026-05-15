export type ConnectionState = 'connecting' | 'connected' | 'disconnected';

type MessageHandler = (type: string, payload: unknown) => void;
type StateHandler = (state: ConnectionState) => void;

const messageHandlers = new Set<MessageHandler>();
const stateHandlers = new Set<StateHandler>();

let socket: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

export let connectionState: ConnectionState = 'disconnected';

function setState(state: ConnectionState): void {
  connectionState = state;
  for (const h of stateHandlers) h(state);
}

function scheduleReconnect(): void {
  if (reconnectTimer !== null) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connect();
  }, 3000);
}

function connect(): void {
  if (socket !== null) return;
  setState('connecting');

  const ws = new WebSocket('ws://localhost:7071');
  socket = ws;

  ws.addEventListener('open', () => {
    setState('connected');
  });

  ws.addEventListener('message', (event: MessageEvent<string>) => {
    try {
      const msg = JSON.parse(event.data) as { type: string; payload: unknown };
      for (const h of messageHandlers) h(msg.type, msg.payload);
    } catch {
      // ignore malformed messages
    }
  });

  ws.addEventListener('close', () => {
    socket = null;
    setState('disconnected');
    scheduleReconnect();
  });

  ws.addEventListener('error', () => {
    ws.close();
  });
}

export function send(type: string, payload: unknown): void {
  if (socket !== null && socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify({ type, payload }));
  }
}

export function onMessage(handler: MessageHandler): () => void {
  messageHandlers.add(handler);
  return () => {
    messageHandlers.delete(handler);
  };
}

export function onConnectionState(handler: StateHandler): () => void {
  stateHandlers.add(handler);
  return () => {
    stateHandlers.delete(handler);
  };
}

connect();

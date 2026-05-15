import express, { type Request, type Response } from 'express';
import { createServer, type Server } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GhostError } from '../ghost/errors.js';

const DEVKIT_PORT = 7070;
const TOOL_NAMES = ['json', 'regex', 'jwt', 'diff', 'hash', 'timestamp', 'cron', 'encoder'];

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let activeServer: Server | null = null;

export async function startDevKit(): Promise<void> {
  if (activeServer) {
    throw new GhostError({
      code: 'DEVKIT_ALREADY_RUNNING',
      message: `DevKit server is already running on port ${DEVKIT_PORT}`,
      hint: 'Call stopDevKit() first before starting again',
    });
  }

  const app = express();
  app.use(express.json());

  const publicDir = path.join(__dirname, 'public');
  app.use(express.static(publicDir));

  app.get('/api/tools', (_req: Request, res: Response) => {
    res.json({ tools: TOOL_NAMES });
  });

  return new Promise<void>((resolve, reject) => {
    const server = createServer(app);

    server.on('error', (err: NodeJS.ErrnoException) => {
      activeServer = null;
      if (err.code === 'EADDRINUSE') {
        reject(
          new GhostError({
            code: 'DEVKIT_PORT_IN_USE',
            message: `Port ${DEVKIT_PORT} is already in use`,
            hint: `Run \`lsof -i :${DEVKIT_PORT}\` to find and stop the conflicting process`,
          }),
        );
      } else {
        reject(
          new GhostError({
            code: 'DEVKIT_SERVER_ERROR',
            message: `DevKit server failed to start: ${err.message}`,
            hint: 'Check system logs for more details',
          }),
        );
      }
    });

    server.listen(DEVKIT_PORT, () => {
      activeServer = server;
      resolve();
    });
  });
}

export async function stopDevKit(): Promise<void> {
  if (!activeServer) {
    throw new GhostError({
      code: 'DEVKIT_NOT_RUNNING',
      message: 'DevKit server is not running',
      hint: 'Call startDevKit() first',
    });
  }

  const server = activeServer;
  activeServer = null;

  return new Promise<void>((resolve, reject) => {
    server.close((err) => {
      if (err) {
        reject(
          new GhostError({
            code: 'DEVKIT_STOP_ERROR',
            message: `Failed to stop DevKit server: ${err.message}`,
            hint: 'The server may have already stopped unexpectedly',
          }),
        );
      } else {
        resolve();
      }
    });
  });
}

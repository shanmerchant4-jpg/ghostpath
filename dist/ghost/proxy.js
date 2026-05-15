import http from 'node:http';
import httpProxy from 'http-proxy';
import { GhostError } from './errors.js';
// All active domain→port routes. One shared HTTP server handles all of them.
const routeMap = new Map();
// Shared server and proxy instance — null when nothing is running.
let server = null;
let proxy = null;
const PROXY_PORT = 80;
function startServer() {
    return new Promise((resolve, reject) => {
        if (server !== null) {
            resolve();
            return;
        }
        proxy = httpProxy.createProxyServer({});
        proxy.on('error', (err, _req, res) => {
            if (res instanceof http.ServerResponse) {
                res.writeHead(502, { 'Content-Type': 'text/plain' });
                res.end(`Proxy error: ${err.message}`);
            }
        });
        server = http.createServer((req, res) => {
            const host = (req.headers.host ?? '').split(':')[0];
            const targetPort = routeMap.get(host);
            if (targetPort === undefined || proxy === null) {
                res.writeHead(404, { 'Content-Type': 'text/plain' });
                res.end(`No GhostPath project is mapped to "${host}"`);
                return;
            }
            proxy.web(req, res, { target: `http://localhost:${targetPort}` });
        });
        server.once('listening', resolve);
        server.once('error', (err) => {
            server = null;
            proxy = null;
            reject(new GhostError({
                code: 'PROXY_START_FAILED',
                message: `Proxy server failed to bind to port ${PROXY_PORT}: ${err.message}`,
                hint: err.code === 'EADDRINUSE'
                    ? `Port ${PROXY_PORT} is already in use. Stop the conflicting service first.`
                    : `Port ${PROXY_PORT} may require elevated permissions. Try running with sudo.`,
            }));
        });
        server.listen(PROXY_PORT);
    });
}
function stopServer() {
    return new Promise((resolve, reject) => {
        if (server === null) {
            resolve();
            return;
        }
        server.close((err) => {
            if (err) {
                reject(new GhostError({
                    code: 'PROXY_STOP_FAILED',
                    message: 'Failed to cleanly shut down the proxy server',
                    hint: 'The proxy server may have already stopped',
                }));
                return;
            }
            server = null;
            proxy = null;
            resolve();
        });
    });
}
export async function startProxy(domain, port) {
    if (routeMap.has(domain)) {
        throw new GhostError({
            code: 'PROXY_ALREADY_ACTIVE',
            message: `A proxy for "${domain}" is already routing to port ${routeMap.get(domain) ?? port}`,
            hint: `Run \`ghostpath stop <project>\` to remove the existing proxy first`,
        });
    }
    routeMap.set(domain, port);
    try {
        await startServer();
    }
    catch (err) {
        // Roll back the route if the server failed to start
        routeMap.delete(domain);
        throw err;
    }
}
export async function stopProxy(domain) {
    if (!routeMap.has(domain)) {
        throw new GhostError({
            code: 'PROXY_NOT_FOUND',
            message: `No active proxy found for "${domain}"`,
            hint: 'The proxy may have already been stopped',
        });
    }
    routeMap.delete(domain);
    if (routeMap.size === 0) {
        await stopServer();
    }
}
/** Returns the port a domain is currently proxied to, or undefined if not active. */
export function getProxyPort(domain) {
    return routeMap.get(domain);
}

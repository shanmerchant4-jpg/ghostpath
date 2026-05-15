import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { GhostError } from '../ghost/errors.js';
function sanitizeName(name) {
    return name.replace(/[^a-z0-9]/gi, '-');
}
function hookFilePath(projectName) {
    return path.join(os.tmpdir(), `ghostpath-${sanitizeName(projectName)}-hook.cjs`);
}
// Generates a self-contained CJS hook file. Uses process.cwd() at load time so
// the hook adapts to whichever project directory the child process starts in.
function generateHookContent(projectName) {
    return `'use strict';
// GhostPath Navigator Hook for project: ${projectName}
// Auto-generated — do not edit. Loaded via Node --require flag.
const Module = require('module');
const { performance } = require('perf_hooks');

const projectDir = process.cwd();

function isUserFile(filePath) {
  return (
    typeof filePath === 'string' &&
    filePath.startsWith(projectDir) &&
    !filePath.includes('node_modules')
  );
}

function getCallerFile() {
  const err = new Error();
  const lines = (err.stack || '').split('\\n');
  for (let i = 1; i < lines.length; i++) {
    const match =
      lines[i].match(/at .+? \\((.+?):\\d+:\\d+\\)/) ||
      lines[i].match(/at (.+?):\\d+:\\d+/);
    if (match && match[1] && isUserFile(match[1])) return match[1];
  }
  return 'unknown';
}

function sendCallEvent(event) {
  if (typeof process.send === 'function') {
    process.send({ type: 'ghost:call', payload: event });
  }
}

function wrapFunction(fn, fnName, filePath) {
  if (fn.__ghostWrapped) return fn;
  const proxy = new Proxy(fn, {
    apply(target, thisArg, args) {
      const callerFile = getCallerFile();
      const start = performance.now();
      let result;
      try {
        result = Reflect.apply(target, thisArg, args);
      } catch (err) {
        sendCallEvent({ fnName, file: filePath, durationMs: performance.now() - start, callerFile });
        throw err;
      }
      if (
        result !== null &&
        result !== undefined &&
        typeof result === 'object' &&
        typeof result.then === 'function'
      ) {
        return result.then(
          (val) => {
            sendCallEvent({ fnName, file: filePath, durationMs: performance.now() - start, callerFile });
            return val;
          },
          (err) => {
            sendCallEvent({ fnName, file: filePath, durationMs: performance.now() - start, callerFile });
            throw err;
          }
        );
      }
      sendCallEvent({ fnName, file: filePath, durationMs: performance.now() - start, callerFile });
      return result;
    },
  });
  try {
    Object.defineProperty(proxy, '__ghostWrapped', { value: true, enumerable: false });
  } catch {}
  return proxy;
}

function wrapExports(exports, filePath) {
  if (exports === null || exports === undefined) return exports;
  if (exports.__ghostWrapped) return exports;

  if (typeof exports === 'function') {
    return wrapFunction(exports, exports.name || 'default', filePath);
  }

  if (typeof exports === 'object') {
    for (const key of Object.keys(exports)) {
      try {
        if (typeof exports[key] === 'function') {
          exports[key] = wrapFunction(exports[key], key, filePath);
        }
      } catch {}
    }
    try {
      Object.defineProperty(exports, '__ghostWrapped', { value: true, enumerable: false });
    } catch {}
  }

  return exports;
}

const _originalLoad = Module._load;
Module._load = function ghostPathLoad(request, parent, isMain) {
  const exports = _originalLoad.apply(this, arguments);
  try {
    const resolved = Module._resolveFilename(request, parent, isMain);
    if (isUserFile(resolved)) {
      return wrapExports(exports, resolved);
    }
  } catch {}
  return exports;
};
`;
}
export function createHook(projectName) {
    const filePath = hookFilePath(projectName);
    try {
        fs.writeFileSync(filePath, generateHookContent(projectName), 'utf8');
    }
    catch {
        throw new GhostError({
            code: 'HOOK_WRITE_FAILED',
            message: `Failed to write instrumentation hook for project "${projectName}"`,
            hint: `Ensure ${os.tmpdir()} is writable`,
        });
    }
    return filePath;
}
export function getHookArgs(projectName) {
    const filePath = createHook(projectName);
    return ['--require', filePath];
}

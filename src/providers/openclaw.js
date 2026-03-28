/**
 * OpenClaw session provider
 * Reads from ~/.openclaw/agents/{agent}/sessions/*.jsonl
 */

import fs from 'fs';
import path from 'path';
import readline from 'readline';
import os from 'os';
import { getLocalDate, createEmptySession, addUsageToSession } from '../common.js';

const DEFAULT_AGENTS_DIR = path.join(os.homedir(), '.openclaw', 'agents');

export const id = 'openclaw';
export const label = 'OpenClaw';

/**
 * Check if this provider has data available
 */
export function available() {
  try {
    const agents = fs.readdirSync(DEFAULT_AGENTS_DIR);
    return agents.some(a => {
      const sessDir = path.join(DEFAULT_AGENTS_DIR, a, 'sessions');
      return fs.existsSync(sessDir) && fs.statSync(sessDir).isDirectory();
    });
  } catch {
    return false;
  }
}

/**
 * Resolve session directories for all agents
 */
function resolveSessionDirs(customPath) {
  if (customPath) return [path.resolve(customPath)];

  try {
    const agents = fs.readdirSync(DEFAULT_AGENTS_DIR);
    const dirs = [];
    for (const agent of agents) {
      const sessDir = path.join(DEFAULT_AGENTS_DIR, agent, 'sessions');
      if (fs.existsSync(sessDir) && fs.statSync(sessDir).isDirectory()) {
        dirs.push(sessDir);
      }
    }
    return dirs.length > 0 ? dirs : [path.join(DEFAULT_AGENTS_DIR, 'main', 'sessions')];
  } catch {
    return [path.join(DEFAULT_AGENTS_DIR, 'main', 'sessions')];
  }
}

/**
 * List all session files across directories
 */
function listSessionFiles(dirs) {
  if (!Array.isArray(dirs)) dirs = [dirs];
  const files = [];
  for (const dir of dirs) {
    try {
      const entries = fs.readdirSync(dir)
        .filter(f => f.includes('.jsonl') && !f.endsWith('.lock') && !f.includes('.acp-stream.'))
        .map(f => path.join(dir, f));
      files.push(...entries);
    } catch {
      // skip unreadable dirs
    }
  }
  return files;
}

/**
 * Parse a single OpenClaw JSONL session file
 */
async function parseSessionFile(filePath) {
  const basename = path.basename(filePath);
  const sessionId = basename.replace(/\.jsonl(?:\.(?:reset|deleted)\..+)?$/, '');

  const session = createEmptySession(sessionId, id);
  session.filePath = filePath;

  const fileStream = fs.createReadStream(filePath, { encoding: 'utf8' });
  const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

  let currentModel = null;

  for await (const line of rl) {
    if (!line.trim()) continue;
    let record;
    try {
      record = JSON.parse(line);
    } catch {
      continue;
    }

    switch (record.type) {
      case 'session':
        session.id = record.id || session.id;
        session.timestamp = record.timestamp;
        break;

      case 'model_change':
        currentModel = record.modelId;
        if (record.modelId) session.models.add(record.modelId);
        break;

      case 'message':
        if (record.message?.role === 'assistant' && record.message?.usage) {
          const usage = record.message.usage;
          const model = record.message?.model || currentModel || 'unknown';
          if (model) session.models.add(model);

          addUsageToSession(session, {
            timestamp: record.timestamp,
            model,
            input: usage.input || 0,
            output: usage.output || 0,
            cacheRead: usage.cacheRead || 0,
            cacheWrite: usage.cacheWrite || 0,
            totalTokens: usage.totalTokens || 0,
            cost: usage.cost?.total || 0,
          });
        }
        break;
    }
  }

  return session;
}

/**
 * Yield all sessions from OpenClaw logs
 */
export async function* sessions({ since, until, timezone, path: customPath } = {}) {
  const dirs = resolveSessionDirs(customPath);
  const files = listSessionFiles(dirs);

  const BATCH = 10;
  for (let i = 0; i < files.length; i += BATCH) {
    const batch = files.slice(i, i + BATCH);
    const results = await Promise.all(batch.map(parseSessionFile));
    for (const session of results) {
      if (!session.timestamp) continue;

      const sessionDate = getLocalDate(session.timestamp, timezone);
      if (since && sessionDate < since) continue;
      if (until && sessionDate > until) continue;

      // Finalize
      session.models = [...session.models];
      yield session;
    }
  }
}

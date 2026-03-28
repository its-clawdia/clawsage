/**
 * Claude Code session provider
 * Reads from ~/.claude/projects/**\/*.jsonl
 */

import fs from 'fs';
import path from 'path';
import readline from 'readline';
import os from 'os';
import { getLocalDate, createEmptySession, addUsageToSession } from '../common.js';
import { loadPricing, calculateCost } from '../pricing.js';

const HOME = os.homedir();
const DEFAULT_CLAUDE_DIRS = [
  path.join(HOME, '.claude'),
  path.join(process.env.XDG_CONFIG_HOME || path.join(HOME, '.config'), 'claude'),
];

export const id = 'claude-code';
export const label = 'Claude Code';

/**
 * Check if this provider has data available
 */
export function available() {
  return DEFAULT_CLAUDE_DIRS.some(dir => {
    const projDir = path.join(dir, 'projects');
    return fs.existsSync(projDir) && fs.statSync(projDir).isDirectory();
  });
}

/**
 * Find all JSONL files under Claude Code's projects dirs
 */
function findSessionFiles() {
  const files = [];
  for (const baseDir of DEFAULT_CLAUDE_DIRS) {
    const projDir = path.join(baseDir, 'projects');
    if (!fs.existsSync(projDir)) continue;

    // Recursively find .jsonl files
    const walk = (dir) => {
      try {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
          if (entry.isDirectory()) {
            walk(path.join(dir, entry.name));
          } else if (entry.name.endsWith('.jsonl')) {
            files.push(path.join(dir, entry.name));
          }
        }
      } catch { /* skip unreadable */ }
    };
    walk(projDir);
  }
  return files;
}

/**
 * Parse a single Claude Code JSONL file
 */
async function parseSessionFile(filePath) {
  const sessionId = path.basename(filePath, '.jsonl');
  const session = createEmptySession(sessionId, id);
  session.filePath = filePath;

  const fileStream = fs.createReadStream(filePath, { encoding: 'utf8' });
  const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

  const seenRequests = new Set();

  for await (const line of rl) {
    if (!line.trim()) continue;
    let record;
    try {
      record = JSON.parse(line);
    } catch {
      continue;
    }

    // Only process assistant messages with usage data
    if (record.type !== 'assistant') continue;
    if (!record.message?.usage) continue;
    if (!record.timestamp) continue;

    // Deduplicate by requestId (Claude Code can have duplicate entries)
    if (record.requestId) {
      if (seenRequests.has(record.requestId)) continue;
      seenRequests.add(record.requestId);
    }

    const usage = record.message.usage;
    const model = record.message.model || 'unknown';
    session.models.add(model);

    if (!session.timestamp || record.timestamp < session.timestamp) {
      session.timestamp = record.timestamp;
    }

    const input = usage.input_tokens || 0;
    const output = usage.output_tokens || 0;
    const cacheWrite = usage.cache_creation_input_tokens || 0;
    const cacheRead = usage.cache_read_input_tokens || 0;
    const totalTokens = input + output + cacheWrite + cacheRead;

    const cost = record.costUSD != null
      ? record.costUSD
      : await calculateCost({ input, output, cacheWrite, cacheRead }, model);

    addUsageToSession(session, {
      timestamp: record.timestamp,
      model,
      input,
      output,
      cacheRead,
      cacheWrite,
      totalTokens,
      cost,
    });
  }

  return session;
}

/**
 * Yield all sessions from Claude Code logs
 */
export async function* sessions({ since, until, timezone } = {}) {
  // Pre-warm pricing cache so parseSessionFile doesn't fetch per-file
  await loadPricing();
  const files = findSessionFiles();

  const BATCH = 10;
  for (let i = 0; i < files.length; i += BATCH) {
    const batch = files.slice(i, i + BATCH);
    const results = await Promise.all(batch.map(parseSessionFile));
    for (const session of results) {
      if (!session.timestamp) continue;
      if (session.messages.length === 0) continue;

      const sessionDate = getLocalDate(session.timestamp, timezone);
      if (since && sessionDate < since) continue;
      if (until && sessionDate > until) continue;

      session.models = [...session.models];
      yield session;
    }
  }
}

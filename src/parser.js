/**
 * parser.js — Stream JSONL session files, extract usage data
 */

import fs from 'fs';
import path from 'path';
import readline from 'readline';
import os from 'os';

const DEFAULT_SESSION_DIR = path.join(os.homedir(), '.openclaw', 'agents', 'main', 'sessions');

/**
 * Resolve session directory path
 */
export function resolveSessionDir(customPath) {
  return customPath ? path.resolve(customPath) : DEFAULT_SESSION_DIR;
}

/**
 * List all .jsonl session files in the directory (exclude .reset. files)
 */
export function listSessionFiles(dir) {
  try {
    return fs.readdirSync(dir)
      .filter(f => f.includes('.jsonl'))
      .map(f => path.join(dir, f));
  } catch (err) {
    throw new Error(`Cannot read session directory: ${dir}\n${err.message}`);
  }
}

/**
 * Parse a single JSONL session file, yielding session data
 * Returns: { id, timestamp, date, models, messages: [{timestamp, model, usage}] }
 */
export async function parseSessionFile(filePath) {
  // Handle both regular (.jsonl) and reset (.jsonl.reset.<timestamp>) files
  const basename = path.basename(filePath);
  const id = basename.replace(/\.jsonl(?:\.(?:reset|deleted)\..+)?$/, '');

  const session = {
    id,
    filePath,
    timestamp: null,
    date: null,
    models: new Set(),
    currentModel: null,
    messages: [],
    totals: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 0,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 }
    }
  };

  const fileStream = fs.createReadStream(filePath, { encoding: 'utf8' });
  const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

  for await (const line of rl) {
    if (!line.trim()) continue;
    let record;
    try {
      record = JSON.parse(line);
    } catch {
      continue; // skip malformed lines
    }

    switch (record.type) {
      case 'session':
        session.id = record.id || session.id;
        session.timestamp = record.timestamp;
        session.date = record.timestamp ? record.timestamp.slice(0, 10) : null;
        break;

      case 'model_change':
        session.currentModel = record.modelId;
        if (record.modelId) session.models.add(record.modelId);
        break;

      case 'message':
        if (record.message?.role === 'assistant' && record.message?.usage) {
          const usage = record.message.usage;
          const model = record.message?.model || session.currentModel || 'unknown';
          if (model) session.models.add(model);

          const msg = {
            timestamp: record.timestamp,
            model,
            usage: {
              input: usage.input || 0,
              output: usage.output || 0,
              cacheRead: usage.cacheRead || 0,
              cacheWrite: usage.cacheWrite || 0,
              totalTokens: usage.totalTokens || 0,
              cost: {
                input: usage.cost?.input || 0,
                output: usage.cost?.output || 0,
                cacheRead: usage.cost?.cacheRead || 0,
                cacheWrite: usage.cost?.cacheWrite || 0,
                total: usage.cost?.total || 0
              }
            }
          };

          session.messages.push(msg);

          // Accumulate totals
          session.totals.input += msg.usage.input;
          session.totals.output += msg.usage.output;
          session.totals.cacheRead += msg.usage.cacheRead;
          session.totals.cacheWrite += msg.usage.cacheWrite;
          session.totals.totalTokens += msg.usage.totalTokens;
          session.totals.cost.input += msg.usage.cost.input;
          session.totals.cost.output += msg.usage.cost.output;
          session.totals.cost.cacheRead += msg.usage.cost.cacheRead;
          session.totals.cost.cacheWrite += msg.usage.cost.cacheWrite;
          session.totals.cost.total += msg.usage.cost.total;
        }
        break;
    }
  }

  session.models = [...session.models];
  return session;
}

/**
 * Parse all session files in parallel (with concurrency limit)
 * Yields results as they complete
 */
export async function* parseAllSessions(sessionDir, { since, until, timezone } = {}) {
  const files = listSessionFiles(sessionDir);

  // Process in batches of 10 for parallelism
  const BATCH = 10;
  for (let i = 0; i < files.length; i += BATCH) {
    const batch = files.slice(i, i + BATCH);
    const results = await Promise.all(batch.map(parseSessionFile));
    for (const session of results) {
      if (!session.timestamp) continue;

      // Date filtering
      const sessionDate = getLocalDate(session.timestamp, timezone);
      if (since && sessionDate < since) continue;
      if (until && sessionDate > until) continue;

      yield session;
    }
  }
}

/**
 * Get YYYY-MM-DD for a timestamp in a given timezone
 */
export function getLocalDate(timestamp, timezone) {
  const date = new Date(timestamp);
  if (!timezone) {
    // Local system time
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  return date.toLocaleDateString('en-CA', { timeZone: timezone }); // en-CA gives YYYY-MM-DD
}

/**
 * Get ISO week string "YYYY-Www" for a date string "YYYY-MM-DD"
 */
export function getISOWeek(dateStr) {
  const date = new Date(dateStr + 'T12:00:00Z');
  const dayOfWeek = date.getUTCDay() || 7; // Monday=1, Sunday=7
  date.setUTCDate(date.getUTCDate() + 4 - dayOfWeek);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((date - yearStart) / 86400000 + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

/**
 * Get "YYYY-MM" from "YYYY-MM-DD"
 */
export function getMonth(dateStr) {
  return dateStr ? dateStr.slice(0, 7) : 'unknown';
}

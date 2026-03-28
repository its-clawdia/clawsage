/**
 * common.js — Shared types and utilities for all providers
 */

/**
 * Create an empty normalized session object
 */
export function createEmptySession(id, provider) {
  return {
    id,
    provider,
    timestamp: null,
    models: new Set(),
    messages: [],
    totals: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 0,
      cost: 0,
    },
  };
}

/**
 * Add a usage entry to a session
 * @param {object} session - Session object from createEmptySession
 * @param {object} entry - { timestamp, model, input, output, cacheRead, cacheWrite, totalTokens, cost }
 */
export function addUsageToSession(session, entry) {
  session.messages.push({
    timestamp: entry.timestamp,
    model: entry.model,
    usage: {
      input: entry.input,
      output: entry.output,
      cacheRead: entry.cacheRead,
      cacheWrite: entry.cacheWrite,
      totalTokens: entry.totalTokens,
      cost: entry.cost,
    },
  });

  session.totals.input += entry.input;
  session.totals.output += entry.output;
  session.totals.cacheRead += entry.cacheRead;
  session.totals.cacheWrite += entry.cacheWrite;
  session.totals.totalTokens += entry.totalTokens;
  session.totals.cost += entry.cost;
}

/**
 * Get YYYY-MM-DD for a timestamp in a given timezone
 */
export function getLocalDate(timestamp, timezone) {
  const date = new Date(timestamp);
  if (!timezone) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  return date.toLocaleDateString('en-CA', { timeZone: timezone });
}

/**
 * Get ISO week string "YYYY-Www" for a date string "YYYY-MM-DD"
 */
export function getISOWeek(dateStr) {
  const date = new Date(dateStr + 'T12:00:00Z');
  const dayOfWeek = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayOfWeek);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((date - yearStart) / 86400000 + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

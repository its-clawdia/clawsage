/**
 * aggregate.js — Group session data by time period and/or model
 */

import { getLocalDate, getISOWeek, getMonth } from './parser.js';

/**
 * Create an empty bucket for accumulating usage
 */
function emptyBucket(key) {
  return {
    key,
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
    totalTokens: 0,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    sessions: 0,
    models: new Set()
  };
}

function addUsage(bucket, usage, model) {
  bucket.input += usage.input;
  bucket.output += usage.output;
  bucket.cacheRead += usage.cacheRead;
  bucket.cacheWrite += usage.cacheWrite;
  bucket.totalTokens += usage.totalTokens;
  bucket.cost.input += usage.cost.input;
  bucket.cost.output += usage.cost.output;
  bucket.cost.cacheRead += usage.cost.cacheRead;
  bucket.cost.cacheWrite += usage.cost.cacheWrite;
  bucket.cost.total += usage.cost.total;
  if (model) bucket.models.add(model);
}

/**
 * Aggregate sessions by a key function
 * Returns sorted array of buckets
 */
export async function aggregateByPeriod(sessionIter, keyFn, { breakdown = false, timezone } = {}) {
  const buckets = new Map(); // key -> bucket
  const modelBuckets = new Map(); // `${key}::${model}` -> bucket

  for await (const session of sessionIter) {
    if (!session.timestamp) continue;
    const date = getLocalDate(session.timestamp, timezone);
    const key = keyFn(date);

    // Ensure bucket exists
    if (!buckets.has(key)) buckets.set(key, emptyBucket(key));
    const bucket = buckets.get(key);
    bucket.sessions++;

    // Accumulate per-message usage
    for (const msg of session.messages) {
      addUsage(bucket, msg.usage, msg.model);

      if (breakdown) {
        const model = msg.model || 'unknown';
        const mkey = `${key}::${model}`;
        if (!modelBuckets.has(mkey)) modelBuckets.set(mkey, emptyBucket(model));
        addUsage(modelBuckets.get(mkey), msg.usage, model);
      }
    }
  }

  // Finalize: convert Sets to arrays
  const result = [...buckets.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, bucket]) => {
      const r = { ...bucket, models: [...bucket.models] };
      if (breakdown) {
        r.breakdown = [...modelBuckets.entries()]
          .filter(([k]) => k.startsWith(key + '::'))
          .map(([k, b]) => ({ ...b, models: [...b.models] }))
          .sort((a, b) => b.cost.total - a.cost.total);
      }
      return r;
    });

  return result;
}

/**
 * Aggregate sessions per-session
 */
export async function aggregateBySessions(sessionIter, { breakdown = false, timezone } = {}) {
  const sessions = [];

  for await (const session of sessionIter) {
    const date = session.timestamp ? getLocalDate(session.timestamp, timezone) : 'unknown';
    const s = {
      key: session.id.slice(0, 8),
      id: session.id,
      date,
      models: session.models,
      ...session.totals,
      cost: { ...session.totals.cost }
    };

    if (breakdown) {
      // Group by model within session
      const modelMap = new Map();
      for (const msg of session.messages) {
        const model = msg.model || 'unknown';
        if (!modelMap.has(model)) modelMap.set(model, emptyBucket(model));
        addUsage(modelMap.get(model), msg.usage, model);
      }
      s.breakdown = [...modelMap.values()]
        .map(b => ({ ...b, models: [...b.models] }))
        .sort((a, b) => b.cost.total - a.cost.total);
    }

    sessions.push(s);
  }

  return sessions.sort((a, b) => a.date.localeCompare(b.date));
}

export { getISOWeek, getMonth };

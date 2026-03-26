/**
 * aggregate.js — Group session data by time period and/or model
 */

import { getLocalDate, getISOWeek } from './common.js';

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
    cost: 0,
    sessions: 0,
    models: new Set(),
    providers: new Set(),
  };
}

function addUsage(bucket, usage, model) {
  bucket.input += usage.input;
  bucket.output += usage.output;
  bucket.cacheRead += usage.cacheRead;
  bucket.cacheWrite += usage.cacheWrite;
  bucket.totalTokens += usage.totalTokens;
  bucket.cost += usage.cost;
  if (model) bucket.models.add(model);
}

/**
 * Aggregate sessions by a key function
 * Returns sorted array of buckets
 */
export async function aggregateByPeriod(sessionIter, keyFn, { breakdown = false, timezone } = {}) {
  const buckets = new Map();
  const modelBuckets = new Map();

  for await (const session of sessionIter) {
    if (!session.timestamp) continue;
    const date = getLocalDate(session.timestamp, timezone);
    const key = keyFn(date);

    if (!buckets.has(key)) buckets.set(key, emptyBucket(key));
    const bucket = buckets.get(key);
    bucket.sessions++;
    bucket.providers.add(session.provider);

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

  const result = [...buckets.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, bucket]) => {
      const r = { ...bucket, models: [...bucket.models], providers: [...bucket.providers] };
      if (breakdown) {
        r.breakdown = [...modelBuckets.entries()]
          .filter(([k]) => k.startsWith(key + '::'))
          .map(([k, b]) => ({ ...b, models: [...b.models], providers: [...b.providers] }))
          .sort((a, b) => b.cost - a.cost);
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
      provider: session.provider,
      date,
      models: Array.isArray(session.models) ? session.models : [...session.models],
      ...session.totals,
    };

    if (breakdown) {
      const modelMap = new Map();
      for (const msg of session.messages) {
        const model = msg.model || 'unknown';
        if (!modelMap.has(model)) modelMap.set(model, emptyBucket(model));
        addUsage(modelMap.get(model), msg.usage, model);
      }
      s.breakdown = [...modelMap.values()]
        .map(b => ({ ...b, models: [...b.models], providers: [...b.providers] }))
        .sort((a, b) => b.cost - a.cost);
    }

    sessions.push(s);
  }

  return sessions.sort((a, b) => a.date.localeCompare(b.date));
}

export { getISOWeek };

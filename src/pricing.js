/**
 * pricing.js — Dynamic model pricing from LiteLLM's pricing database
 *
 * Fetches pricing from GitHub, caches locally for 24h, falls back to
 * embedded defaults if network is unavailable.
 */

import fs from 'fs';
import path from 'path';
import os from 'os';

const LITELLM_PRICING_URL =
  'https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json';

const CACHE_DIR = path.join(os.homedir(), '.cache', 'clawsage');
const CACHE_FILE = path.join(CACHE_DIR, 'pricing.json');
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

// Fallback pricing — used when fetch fails and no cache exists
const FALLBACK_PRICING = {
  'claude-opus-4-6':   { input: 5e-6, output: 25e-6, cacheWrite: 6.25e-6, cacheRead: 5e-7 },
  'claude-sonnet-4-6': { input: 3e-6, output: 15e-6, cacheWrite: 3.75e-6, cacheRead: 3e-7 },
  'claude-haiku-4-6':  { input: 8e-7, output: 4e-6,  cacheWrite: 1e-6,    cacheRead: 8e-8 },
  'claude-sonnet-4-5-20250514': { input: 3e-6, output: 15e-6, cacheWrite: 3.75e-6, cacheRead: 3e-7 },
  'claude-3-5-sonnet-20241022': { input: 3e-6, output: 15e-6, cacheWrite: 3.75e-6, cacheRead: 3e-7 },
};

let pricingCache = null; // in-memory cache for the process lifetime

/**
 * Convert a LiteLLM pricing entry to our format (per-token costs).
 */
function toLiteLLMEntry(entry) {
  const input = entry.input_cost_per_token;
  const output = entry.output_cost_per_token;
  const cacheWrite = entry.cache_creation_input_token_cost;
  const cacheRead = entry.cache_read_input_token_cost;
  if (input == null || output == null) return null;
  return {
    input,
    output,
    cacheWrite: cacheWrite ?? input * 1.25, // reasonable default if missing
    cacheRead: cacheRead ?? input * 0.1,
  };
}

/**
 * Extract Anthropic (direct API) model pricing from the full LiteLLM dataset.
 * Keeps only models with `litellm_provider === 'anthropic'` and valid costs.
 */
function extractAnthropicPricing(rawData) {
  const pricing = {};
  for (const [key, entry] of Object.entries(rawData)) {
    if (key === 'sample_spec') continue;
    if (entry.litellm_provider !== 'anthropic') continue;
    const p = toLiteLLMEntry(entry);
    if (p) pricing[key] = p;
  }
  return pricing;
}

/**
 * Read cached pricing from disk if fresh enough.
 */
function readCache() {
  try {
    const stat = fs.statSync(CACHE_FILE);
    if (Date.now() - stat.mtimeMs > CACHE_TTL_MS) return null;
    return JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
  } catch {
    return null;
  }
}

/**
 * Write pricing to disk cache.
 */
function writeCache(pricing) {
  try {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    fs.writeFileSync(CACHE_FILE, JSON.stringify(pricing), 'utf8');
  } catch {
    // non-fatal
  }
}

/**
 * Fetch fresh pricing from LiteLLM GitHub.
 */
async function fetchPricing() {
  const res = await fetch(LITELLM_PRICING_URL);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const raw = await res.json();
  return extractAnthropicPricing(raw);
}

/**
 * Load pricing: in-memory → disk cache → network → fallback.
 */
export async function loadPricing() {
  if (pricingCache) return pricingCache;

  // Try disk cache
  const cached = readCache();
  if (cached && Object.keys(cached).length > 0) {
    pricingCache = cached;
    return pricingCache;
  }

  // Try network
  try {
    const fresh = await fetchPricing();
    if (Object.keys(fresh).length > 0) {
      writeCache(fresh);
      pricingCache = fresh;
      return pricingCache;
    }
  } catch {
    // network unavailable — fall through
  }

  pricingCache = FALLBACK_PRICING;
  return pricingCache;
}

/**
 * Look up per-token pricing for a model name.
 * Tries exact match, then substring match, then falls back to Sonnet pricing.
 */
export async function getPricing(model) {
  const pricing = await loadPricing();

  // Exact match
  if (pricing[model]) return pricing[model];

  // Substring match (e.g. "claude-sonnet-4-6" matches "claude-sonnet-4-6-20260205")
  for (const [key, p] of Object.entries(pricing)) {
    if (model.includes(key) || key.includes(model)) return p;
  }

  // Fallback to Sonnet 4.6 → Sonnet 4.5 → first available → hardcoded
  return (
    pricing['claude-sonnet-4-6'] ||
    pricing['claude-sonnet-4-5'] ||
    Object.values(pricing)[0] ||
    FALLBACK_PRICING['claude-sonnet-4-6']
  );
}

/**
 * Calculate cost from token counts and model name.
 */
export async function calculateCost(usage, model) {
  const p = await getPricing(model);
  return (
    usage.input * p.input +
    usage.output * p.output +
    usage.cacheWrite * p.cacheWrite +
    usage.cacheRead * p.cacheRead
  );
}

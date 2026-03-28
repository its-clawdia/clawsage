/**
 * Provider registry
 * Auto-discovers available providers and yields merged sessions
 */

import * as openclaw from './openclaw.js';
import * as claudeCode from './claude-code.js';

// All known providers — add new harnesses here
const ALL_PROVIDERS = [openclaw, claudeCode];

/**
 * Get list of providers that have data available
 */
export function getAvailableProviders() {
  return ALL_PROVIDERS.filter(p => p.available());
}

/**
 * Yield sessions from all available providers (or a specific one)
 * Each session has a .provider field indicating its source
 */
export async function* allSessions(opts = {}) {
  const { provider: filterProvider, ...rest } = opts;

  const providers = filterProvider
    ? ALL_PROVIDERS.filter(p => p.id === filterProvider)
    : getAvailableProviders();

  for (const provider of providers) {
    yield* provider.sessions(rest);
  }
}

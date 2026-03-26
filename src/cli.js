#!/usr/bin/env node
/**
 * cli.js — ocusage CLI entry point
 */

import { resolveSessionDir, parseAllSessions, getISOWeek, getMonth } from './parser.js';
import { aggregateByPeriod, aggregateBySessions } from './aggregate.js';
import { printPeriodReport, printSessionReport } from './format.js';

// ─── Argument Parsing ───────────────────────────────────────────────────────

function parseArgs(argv) {
  const args = argv.slice(2);
  const opts = {
    command: 'daily',
    since: null,
    until: null,
    json: false,
    breakdown: false,
    timezone: null,
    path: null,
    help: false,
  };

  let i = 0;
  while (i < args.length) {
    const arg = args[i];
    switch (arg) {
      case 'daily':
      case 'weekly':
      case 'monthly':
      case 'session':
        opts.command = arg;
        break;
      case '--since':
        opts.since = args[++i];
        break;
      case '--until':
        opts.until = args[++i];
        break;
      case '--json':
        opts.json = true;
        break;
      case '--breakdown':
        opts.breakdown = true;
        break;
      case '--timezone':
        opts.timezone = args[++i];
        break;
      case '--path':
        opts.path = args[++i];
        break;
      case '--help':
      case '-h':
        opts.help = true;
        break;
      default:
        if (!arg.startsWith('-')) {
          // Assume it's a subcommand we don't know
          console.error(`Unknown command: ${arg}`);
        }
    }
    i++;
  }

  // Parse YYYYMMDD dates into YYYY-MM-DD
  if (opts.since) {
    opts.since = opts.since.replace(/^(\d{4})(\d{2})(\d{2})$/, '$1-$2-$3');
  }
  if (opts.until) {
    opts.until = opts.until.replace(/^(\d{4})(\d{2})(\d{2})$/, '$1-$2-$3');
  }

  return opts;
}

// ─── Help ────────────────────────────────────────────────────────────────────

function printHelp() {
  console.log(`
ocusage — OpenClaw session cost analysis

Usage:
  ocusage [command] [options]

Commands:
  daily    (default) Aggregate costs by date
  weekly   Aggregate costs by ISO week
  monthly  Aggregate costs by month
  session  Per-session breakdown

Options:
  --since YYYYMMDD    Filter sessions on or after this date
  --until YYYYMMDD    Filter sessions on or before this date
  --json              Output as JSON
  --breakdown         Show per-model cost breakdown
  --timezone TZ       Timezone for date grouping (e.g. America/Los_Angeles)
  --path DIR          Custom session directory
  --help, -h          Show this help

Examples:
  ocusage                        Daily cost report
  ocusage monthly                Monthly summary
  ocusage session --breakdown    Sessions with per-model breakdown
  ocusage --since 20260301       Filter from March 1, 2026
  ocusage --json | jq .          JSON output piped to jq
`);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const opts = parseArgs(process.argv);

  if (opts.help) {
    printHelp();
    process.exit(0);
  }

  const sessionDir = resolveSessionDir(opts.path);

  const streamOpts = {
    since: opts.since,
    until: opts.until,
    timezone: opts.timezone,
  };

  try {
    let data;

    if (opts.command === 'session') {
      const sessionStream = parseAllSessions(sessionDir, streamOpts);
      data = await aggregateBySessions(sessionStream, {
        breakdown: opts.breakdown,
        timezone: opts.timezone,
      });
    } else {
      // Period-based aggregation
      const keyFn = {
        daily: (date) => date,
        weekly: (date) => getISOWeek(date),
        monthly: (date) => date.slice(0, 7),
      }[opts.command] || ((date) => date);

      const sessionStream = parseAllSessions(sessionDir, streamOpts);
      data = await aggregateByPeriod(sessionStream, keyFn, {
        breakdown: opts.breakdown,
        timezone: opts.timezone,
      });
    }

    if (opts.json) {
      // Serialize (Sets are already converted to arrays in aggregation)
      console.log(JSON.stringify(data, null, 2));
      return;
    }

    if (opts.command === 'session') {
      printSessionReport(data, { breakdown: opts.breakdown });
    } else {
      printPeriodReport(data, { mode: opts.command, breakdown: opts.breakdown });
    }

  } catch (err) {
    console.error(`\nError: ${err.message}`);
    process.exit(1);
  }
}

main();

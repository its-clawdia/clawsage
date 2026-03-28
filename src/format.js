/**
 * format.js — Terminal table formatting with ANSI colors
 */

// ANSI color codes
const C = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  white: '\x1b[37m',
  gray: '\x1b[90m',
};

function c(color, text) {
  if (!process.stdout.isTTY) return text;
  return C[color] + text + C.reset;
}

function bold(text) { return c('bold', text); }
function dim(text) { return c('dim', text); }
function gray(text) { return c('gray', text); }
function cyan(text) { return c('cyan', text); }
function green(text) { return c('green', text); }
function yellow(text) { return c('yellow', text); }
function magenta(text) { return c('magenta', text); }

function fmtNum(n) {
  if (!n || n === 0) return gray('0');
  return n.toLocaleString();
}

function fmtCost(n) {
  if (!n || n === 0) return gray('$0.0000');
  if (n < 0.001) return green(`$${n.toFixed(6)}`);
  if (n < 1) return green(`$${n.toFixed(4)}`);
  return yellow(`$${n.toFixed(4)}`);
}

function fmtTokens(n) {
  if (!n || n === 0) return gray('0');
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

function visLen(str) {
  return str.replace(/\x1b\[[0-9;]*m/g, '').length;
}

function padEnd(str, width) {
  return str + ' '.repeat(Math.max(0, width - visLen(str)));
}

function padStart(str, width) {
  return ' '.repeat(Math.max(0, width - visLen(str))) + str;
}

function renderTable(headers, rows, aligns) {
  const allRows = [headers, ...rows];
  const cols = headers.length;
  const widths = Array(cols).fill(0);

  for (const row of allRows) {
    for (let i = 0; i < cols; i++) {
      widths[i] = Math.max(widths[i], visLen(row[i] || ''));
    }
  }

  const topBorder = gray('┌' + widths.map(w => '─'.repeat(w + 2)).join('┬') + '┐');
  const midBorder = gray('├' + widths.map(w => '─'.repeat(w + 2)).join('┼') + '┤');
  const botBorder = gray('└' + widths.map(w => '─'.repeat(w + 2)).join('┴') + '┘');

  function renderRow(row) {
    const cells = row.map((cell, i) => {
      const align = aligns?.[i] || 'left';
      const padded = align === 'right'
        ? padStart(cell || '', widths[i])
        : padEnd(cell || '', widths[i]);
      return ` ${padded} `;
    });
    return gray('│') + cells.join(gray('│')) + gray('│');
  }

  const lines = [topBorder];
  lines.push(renderRow(headers.map(h => bold(cyan(h)))));
  lines.push(midBorder);
  for (const row of rows) {
    lines.push(renderRow(row));
  }
  lines.push(botBorder);
  return lines.join('\n');
}

/**
 * Build a title from available providers
 */
function buildTitle(mode, providers) {
  const providerNames = providers && providers.length > 0
    ? providers.join(' + ')
    : 'OpenClaw';
  return `${providerNames} Usage — ${mode} Report`;
}

/**
 * Collect all unique provider names from data
 */
function collectProviders(data) {
  const all = new Set();
  for (const d of data) {
    if (d.providers) d.providers.forEach(p => all.add(p));
    if (d.provider) all.add(d.provider);
  }
  return [...all];
}

/**
 * Print daily/weekly/monthly report
 */
export function printPeriodReport(data, { mode = 'daily', breakdown = false } = {}) {
  if (data.length === 0) {
    console.log(yellow('No data found.'));
    return;
  }

  const providers = collectProviders(data);
  const title = { daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly' }[mode] || 'Report';
  console.log(bold(cyan(`\n  ${buildTitle(title, providers)}\n`)));

  const headers = ['Period', 'Sessions', 'Input', 'Output', 'Cache↑', 'Cache↓', 'Total Tokens', 'Cost'];
  const aligns = ['left', 'right', 'right', 'right', 'right', 'right', 'right', 'right'];

  let totalSessions = 0, totalTokens = 0, totalCost = 0;

  const rows = data.map(d => {
    totalSessions += d.sessions;
    totalTokens += d.totalTokens;
    totalCost += d.cost;
    return [
      bold(d.key),
      fmtNum(d.sessions),
      fmtTokens(d.input),
      fmtTokens(d.output),
      fmtTokens(d.cacheRead),
      fmtTokens(d.cacheWrite),
      fmtTokens(d.totalTokens),
      fmtCost(d.cost),
    ];
  });

  console.log(renderTable(headers, rows, aligns));
  console.log('\n' + bold('  Totals: ') +
    `${fmtNum(totalSessions)} sessions  ·  ` +
    `${fmtTokens(totalTokens)} tokens  ·  ` +
    `${bold(fmtCost(totalCost))} total cost`);

  if (breakdown) {
    for (const d of data) {
      if (!d.breakdown?.length) continue;
      console.log(`\n  ${bold(cyan(d.key))} — model breakdown:`);
      const bHeaders = ['Model', 'Input', 'Output', 'Cache↑', 'Cache↓', 'Cost'];
      const bAligns = ['left', 'right', 'right', 'right', 'right', 'right'];
      const bRows = d.breakdown.map(b => [
        magenta(b.key),
        fmtTokens(b.input),
        fmtTokens(b.output),
        fmtTokens(b.cacheRead),
        fmtTokens(b.cacheWrite),
        fmtCost(b.cost),
      ]);
      console.log(renderTable(bHeaders, bRows, bAligns));
    }
  }

  console.log('');
}

/**
 * Print session report
 */
export function printSessionReport(data, { breakdown = false } = {}) {
  if (data.length === 0) {
    console.log(yellow('No sessions found.'));
    return;
  }

  const providers = collectProviders(data);
  console.log(bold(cyan(`\n  ${buildTitle('Session', providers)}\n`)));

  const showProvider = providers.length > 1;
  const headers = showProvider
    ? ['Session ID', 'Source', 'Date', 'Models', 'Input', 'Output', 'Cache↑', 'Cache↓', 'Cost']
    : ['Session ID', 'Date', 'Models', 'Input', 'Output', 'Cache↑', 'Cache↓', 'Cost'];
  const aligns = showProvider
    ? ['left', 'left', 'left', 'left', 'right', 'right', 'right', 'right', 'right']
    : ['left', 'left', 'left', 'right', 'right', 'right', 'right', 'right'];

  let totalCost = 0, totalTokens = 0;

  const rows = data.map(s => {
    totalCost += s.cost;
    totalTokens += s.totalTokens;
    const base = [
      gray(s.key),
      ...(showProvider ? [dim(s.provider || '?')] : []),
      s.date,
      magenta(s.models.slice(0, 2).map(m => m.replace('claude-', '')).join(', ') || 'unknown'),
      fmtTokens(s.input),
      fmtTokens(s.output),
      fmtTokens(s.cacheRead),
      fmtTokens(s.cacheWrite),
      fmtCost(s.cost),
    ];
    return base;
  });

  console.log(renderTable(headers, rows, aligns));
  console.log('\n' + bold('  Totals: ') +
    `${data.length} sessions  ·  ` +
    `${fmtTokens(totalTokens)} tokens  ·  ` +
    `${bold(fmtCost(totalCost))} total cost`);

  if (breakdown) {
    for (const s of data) {
      if (!s.breakdown?.length) continue;
      console.log(`\n  Session ${gray(s.key)} (${s.date}) — model breakdown:`);
      const bHeaders = ['Model', 'Input', 'Output', 'Cache↑', 'Cache↓', 'Cost'];
      const bAligns = ['left', 'right', 'right', 'right', 'right', 'right'];
      const bRows = s.breakdown.map(b => [
        magenta(b.key),
        fmtTokens(b.input),
        fmtTokens(b.output),
        fmtTokens(b.cacheRead),
        fmtTokens(b.cacheWrite),
        fmtCost(b.cost),
      ]);
      console.log(renderTable(bHeaders, bRows, bAligns));
    }
  }

  console.log('');
}

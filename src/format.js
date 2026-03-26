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
  bgBlue: '\x1b[44m',
  bgDark: '\x1b[48;5;235m',
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
function blue(text) { return c('blue', text); }
function magenta(text) { return c('magenta', text); }

/**
 * Format a number with commas
 */
function fmtNum(n) {
  if (!n || n === 0) return gray('0');
  return n.toLocaleString();
}

/**
 * Format cost as $X.XXXX
 */
function fmtCost(n) {
  if (!n || n === 0) return gray('$0.0000');
  if (n < 0.001) return green(`$${n.toFixed(6)}`);
  if (n < 1) return green(`$${n.toFixed(4)}`);
  return yellow(`$${n.toFixed(4)}`);
}

/**
 * Format token count compactly (e.g. 14.9k, 1.2M)
 */
function fmtTokens(n) {
  if (!n || n === 0) return gray('0');
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

/**
 * Pad string to width (accounting for ANSI escape codes)
 */
function visLen(str) {
  return str.replace(/\x1b\[[0-9;]*m/g, '').length;
}

function padEnd(str, width) {
  const vl = visLen(str);
  return str + ' '.repeat(Math.max(0, width - vl));
}

function padStart(str, width) {
  const vl = visLen(str);
  return ' '.repeat(Math.max(0, width - vl)) + str;
}

/**
 * Render a table
 * @param {string[]} headers
 * @param {string[][]} rows
 * @param {'left'|'right'[]} aligns
 */
function renderTable(headers, rows, aligns) {
  const allRows = [headers, ...rows];
  const cols = headers.length;
  const widths = Array(cols).fill(0);

  for (const row of allRows) {
    for (let i = 0; i < cols; i++) {
      widths[i] = Math.max(widths[i], visLen(row[i] || ''));
    }
  }

  const sep = gray('┼' + widths.map(w => '─'.repeat(w + 2)).join('┼') + '┼');
  const topBorder = gray('┌' + widths.map(w => '─'.repeat(w + 2)).join('┬') + '┐');
  const midBorder = gray('├' + widths.map(w => '─'.repeat(w + 2)).join('┼') + '┤');
  const botBorder = gray('└' + widths.map(w => '─'.repeat(w + 2)).join('┴') + '┘');

  function renderRow(row, isHeader = false) {
    const cells = row.map((cell, i) => {
      const align = aligns?.[i] || 'left';
      const padded = align === 'right'
        ? padStart(cell || '', widths[i])
        : padEnd(cell || '', widths[i]);
      return ` ${padded} `;
    });
    const line = gray('│') + cells.join(gray('│')) + gray('│');
    return line;
  }

  const lines = [];
  lines.push(topBorder);
  lines.push(renderRow(headers.map(h => bold(cyan(h))), true));
  lines.push(midBorder);

  for (let i = 0; i < rows.length; i++) {
    lines.push(renderRow(rows[i]));
  }
  lines.push(botBorder);

  return lines.join('\n');
}

/**
 * Format the "Totals" summary footer
 */
function formatTotals(rows) {
  let input = 0, output = 0, cacheRead = 0, cacheWrite = 0, cost = 0;
  for (const row of rows) {
    input += row._input || 0;
    output += row._output || 0;
    cacheRead += row._cacheRead || 0;
    cacheWrite += row._cacheWrite || 0;
    cost += row._cost || 0;
  }
  return { input, output, cacheRead, cacheWrite, cost };
}

/**
 * Print daily/weekly/monthly report
 */
export function printPeriodReport(data, { mode = 'daily', breakdown = false } = {}) {
  if (data.length === 0) {
    console.log(yellow('No data found.'));
    return;
  }

  const title = { daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly' }[mode] || 'Report';
  console.log(bold(cyan(`\n  OpenClaw Usage — ${title} Report\n`)));

  const headers = ['Period', 'Sessions', 'Input', 'Output', 'Cache↑', 'Cache↓', 'Total Tokens', 'Cost'];
  const aligns = ['left', 'right', 'right', 'right', 'right', 'right', 'right', 'right'];
  const rawRows = [];

  let totalSessions = 0, totalInput = 0, totalOutput = 0;
  let totalCacheR = 0, totalCacheW = 0, totalTokens = 0, totalCost = 0;

  for (const d of data) {
    rawRows.push([
      bold(d.key),
      fmtNum(d.sessions),
      fmtTokens(d.input),
      fmtTokens(d.output),
      fmtTokens(d.cacheRead),
      fmtTokens(d.cacheWrite),
      fmtTokens(d.totalTokens),
      fmtCost(d.cost.total),
    ]);
    totalSessions += d.sessions;
    totalInput += d.input;
    totalOutput += d.output;
    totalCacheR += d.cacheRead;
    totalCacheW += d.cacheWrite;
    totalTokens += d.totalTokens;
    totalCost += d.cost.total;
  }

  console.log(renderTable(headers, rawRows, aligns));

  // Totals row
  const totalsRow = [
    bold(yellow('TOTAL')),
    fmtNum(totalSessions),
    fmtTokens(totalInput),
    fmtTokens(totalOutput),
    fmtTokens(totalCacheR),
    fmtTokens(totalCacheW),
    fmtTokens(totalTokens),
    fmtCost(totalCost),
  ];
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
        fmtCost(b.cost.total),
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

  console.log(bold(cyan('\n  OpenClaw Usage — Session Report\n')));

  const headers = ['Session ID', 'Date', 'Models', 'Input', 'Output', 'Cache↑', 'Cache↓', 'Cost'];
  const aligns = ['left', 'left', 'left', 'right', 'right', 'right', 'right', 'right'];

  let totalCost = 0, totalTokens = 0;

  const rows = data.map(s => {
    totalCost += s.cost.total;
    totalTokens += s.totalTokens;
    return [
      gray(s.key),
      s.date,
      magenta(s.models.slice(0, 2).map(m => m.replace('claude-', '')).join(', ') || 'unknown'),
      fmtTokens(s.input),
      fmtTokens(s.output),
      fmtTokens(s.cacheRead),
      fmtTokens(s.cacheWrite),
      fmtCost(s.cost.total),
    ];
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
        fmtCost(b.cost.total),
      ]);
      console.log(renderTable(bHeaders, bRows, bAligns));
    }
  }

  console.log('');
}

# ocusage

OpenClaw Usage — cost analysis CLI for OpenClaw session logs.

## Installation

```bash
npm install -g .
```

## Usage

```
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
  --breakdown         Show per-model breakdown
  --timezone TZ       Timezone for date grouping (default: local)
  --path DIR          Custom session directory
  --help, -h          Show help
```

## Examples

```bash
ocusage                     # Daily report
ocusage daily               # Daily report
ocusage monthly             # Monthly report
ocusage weekly              # Weekly report
ocusage session             # Per-session breakdown
ocusage --since 20260301    # Filter from March 2026
ocusage --json              # JSON output
ocusage --breakdown         # Per-model cost breakdown
```

## Data Source

Reads from `~/.openclaw/agents/main/sessions/*.jsonl` by default.

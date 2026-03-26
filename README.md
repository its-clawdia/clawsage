# clawsage

OpenClaw Usage — cost analysis CLI for OpenClaw session logs.

## Quick Start

```bash
# Run without installing
npx clawsage@latest
bunx clawsage@latest

# Or install globally
npm install -g clawsage
```

## Usage

```
clawsage [command] [options]

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
clawsage                     # Daily report
clawsage daily               # Daily report
clawsage monthly             # Monthly report
clawsage weekly              # Weekly report
clawsage session             # Per-session breakdown
clawsage --since 20260301    # Filter from March 2026
clawsage --json              # JSON output
clawsage --breakdown         # Per-model cost breakdown
```

## Data Source

Reads from `~/.openclaw/agents/main/sessions/*.jsonl` by default.

# clawsage

Cost analysis CLI for [OpenClaw](https://github.com/openclaw/openclaw) session logs. Supports multiple providers (OpenClaw, Claude Code) and fetches live model pricing from [LiteLLM](https://github.com/BerriAI/litellm).

## Quick Start

```bash
# Run without installing
npx clawsage@latest

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
  --provider ID       Only show data from a specific provider
  --timezone TZ       Timezone for date grouping (default: local)
  --path DIR          Custom session directory (OpenClaw provider only)
  --help, -h          Show help
```

## Examples

```bash
clawsage                              # Combined daily report (all providers)
clawsage monthly                      # Monthly report
clawsage weekly                       # Weekly report
clawsage session --breakdown          # Sessions with per-model breakdown
clawsage --provider openclaw          # OpenClaw sessions only
clawsage --provider claude-code       # Claude Code sessions only
clawsage --since 20260301 --json      # JSON output from March 2026
```

## Providers

clawsage auto-detects available providers by checking for session data in their default locations:

| Provider | Session Path |
|---|---|
| OpenClaw | `~/.openclaw/agents/*/sessions/*.jsonl` |
| Claude Code | `~/.claude/projects/*/sessions/*.jsonl` |

Use `--provider <id>` to restrict output to a single provider.

## Pricing

Model costs are fetched from [LiteLLM's pricing database](https://github.com/BerriAI/litellm) and cached locally for 24 hours (`~/.cache/clawsage/pricing.json`). Falls back to built-in defaults if the network is unavailable.

## License

MIT

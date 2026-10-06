# Saiyairak 2D AI Development Loop

Cloudflare is the scheduler/trigger. GitHub is the source of truth. This directory stores loop state and QA history.

## Rules
- Never modify production directly from the loop.
- Work on a dedicated `ai/dev-loop` branch.
- Build and test before any production merge.
- Never commit secrets or API keys.
- One bounded engineering task per cycle.
- Record failures so the next cycle does not repeat the same experiment.

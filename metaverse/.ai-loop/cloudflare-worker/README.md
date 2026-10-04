# Cloudflare trigger

This Worker is intentionally a scheduler/queue trigger only. It does not call OpenAI and contains no API key.

- `POST /trigger` queues one bounded development-cycle instruction.
- Cron runs every 6 hours and queues the next-cycle instruction.
- Production deployment is explicitly prohibited by the task contract.

The queue consumer/executor remains separate so a future AI or local Termux executor can process tasks safely.

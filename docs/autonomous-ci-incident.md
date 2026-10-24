# Autonomous developer dependency installation failure

Evidence: Actions run 40075989811 at commit
1cc632f2b2fba5bceb4e35f42b32e0d320766f5d. GitHub's jobs API confirms
Install dependencies failed and Autonomous development cycle was skipped.
The reported command is `bun install --frozen-lockfile` with Bun 1.2.0.

## Root cause and correction

The autonomous workflow and workspace devEngines selected Bun 1.2.0, while
Web Build and both Dockerfiles selected 1.3.14. Use 1.3.14 consistently.
There is also independently reproduced dependency drift: with the original
lockfile, Bun 1.3.14 attempted to resolve the five `@types/bun: latest`
requirements again and rejected frozen installation. Regenerating only the
lockfile changed @types/bun and bun-types from 1.4.3 to 1.4.4. Thus changing
the runtime alone is insufficient to prevent recurrence.

Pin all five requirements to the existing locked 1.4.3 release and regenerate
with Bun 1.3.14 (`bun install --lockfile-only`). This preserves the previous
top-level type version and removes obsolete nested logger type entries.
Frozen installation remains enabled in every workflow and Dockerfile.
A fresh manifest-only copy installed 770 packages with the corrected lockfile;
its SHA-256 remained
`5915f894ebf902b14b50e49ee3577599962660d3e13cfd9a475bf1c672ddc42e`.

## Validation and operational limits

- Bun regression suite: 82 passed, 0 failed.
- Python autonomous control-flow tests: 4 passed, no external API calls.
- Workspace type checks: all 6 participating tasks passed.
- Workspace build: passed; existing large-chunk warnings remain.
- Prisma client generation, four database migrations and seed: passed.
- Production container: built successfully with a temporary BuildKit CA mount
  for the cloud proxy; TLS verification remained enabled and the repository
  Dockerfile was unchanged.
- Black-box integration suite: 64 passed, 0 failed across 10 suites after
  repairing stale fixtures. Commit 153e917 restricted room creation to Admin,
  but fixtures still created ordinary users. Explicit admin fixtures now update
  only newly created test accounts in a loopback database, then sign in again.
  A new regression test confirms regular users still receive 403.
  Commit f0ae2b8 deliberately removed code lookup for security. Tests now assert
  that the route remains unavailable, including authenticated requests; the
  removed route was not restored.
- Use `pnpm test --runInBand` from `tests/`; an extra `--` is interpreted as a
  Jest test-name pattern by this pinned pnpm version.

The generator now exits unsuccessfully when its key is missing, its checkout
is dirty or generation/repair fails. Previously these paths could look green
without performing development. Offline tests verify entry into generation
and validation and enforce the existing call budget. They do not prove live
Gemini model availability or credentials. No billable AI request is made for
this repair, and no production deployment or merge is performed.

## Prevention

Use Bun 1.3.14 locally, in Actions, in devEngines and in Docker. Update these
together in reviewed changes. Avoid moving dependency tags such as `latest`;
update explicit versions and the lockfile together. Always validate frozen
installation in a fresh dependency directory before merging. Web Build now
also runs offline autonomous tests and checks all participating workspaces.
Do not interpret an offline test or an empty patch as proof of a live model
request; inspect the autonomous step and its outcome explicitly.

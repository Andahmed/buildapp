# Open-source game and agent stack

This plan extends the existing BuildApp application. It does not replace Next.js, Prisma, current office/agent workflows, or the HTML5 Games Studio.

## Integration decisions

| Project | License checked | Role in BuildApp | Integration boundary | Initial state |
| --- | --- | --- | --- | --- |
| [Phaser](https://github.com/phaserjs/phaser) | MIT (repository package metadata) | Production 2D HTML5 runtime for games created in Games Studio | Pinned npm dependency; mounted only in a client-side game preview component | In progress; dependency and adapter committed, runtime smoke test added |
| [StemStudio Engine](https://github.com/Stem-Studio/Engine) | MIT (repository LICENSE) | Optional 3D editor/runtime | Separate service or separately built static app; embed through a tightly sandboxed origin | Planned; separate deployment required |
| [VibeGame](https://github.com/tettethu/VibeGame) | Apache-2.0 (pyproject and README) | Research/build worker for prompt-to-game authoring | Isolated worker with per-job workspace, strict resource limits, artifact-only return path | Research only; do not run in production yet |
| [Mastra](https://github.com/mastra-ai/mastra) | Apache-2.0 (monorepo and @mastra/core metadata) | TypeScript agent orchestration, tools, memory and evaluations | Introduce selectively behind the existing provider and task interfaces | Planned; dependency and API compatibility tests required |
| [Agno](https://github.com/agno-agi/agno) | Apache-2.0 (README and LICENSE) | Optional durable specialist-agent service | Separate AgentOS API service; BuildApp calls it through an authenticated server-side adapter | Planned; separate deployment and credentials required |

## Step 1: Phaser — current implementation status

Committed on `feat/open-source-game-ai-stack`:

- `package.json` now pins `phaser@4.2.1` (latest stable release, MIT).
- `src/lib/integrations/phaser-preview.ts` — client-only adapter: lazy dynamic import, mount into an existing DOM node, explicit `destroy()` cleanup. Never imported on the server, never reads secrets, never touches the database.
- `src/components/office/phaser-smoke-test.tsx` — manual smoke-test panel that verifies the Phaser runtime mounts, animates, handles pointer/touch input, and unmounts cleanly.
- Registry entry for Phaser remains `enabled: false` until validation completes.

Remaining gates before Phaser can be enabled:

1. Run `bun install` locally and commit the regenerated `bun.lock` (it is not committed from a remote tool).
2. Run a full `bun run build` and `bun run lint` on the branch.
3. Run the smoke-test panel on a desktop browser and a mobile browser; verify mount, touch input, and clean unmount.
4. Re-check transitive dependency advisories for the exact pinned 4.2.1 tree.
5. Only then flip the registry state for Phaser to ready and wire the adapter into the Games Studio preview path, keeping the current HTML5 iframe preview as fallback.

## Why the integrations are not bundled into the web process

- StemStudio's OSS package runs a Vite editor plus a Go AI server and a multiplayer service. Its package manifest also has a substantial dependency tree and postinstall work. It should not be copied into the Next.js server or the existing Railway service.
- VibeGame requires Python 3.12+, uv, tmux and a supported coding-agent CLI. Its README documents launching Claude Code with `--dangerously-skip-permissions`. That execution mode is not acceptable for a production multi-tenant worker. VibeGame remains disabled until its agent execution is redesigned around a restricted sandbox, explicit allowlists, time/resource limits, and human approval.
- Agno's current recommended platform is AgentOS, with its own API/MCP, PostgreSQL-backed state, auth, durable execution and approvals. It should have its own service and data store, not share BuildApp's Prisma database.
- Mastra and Agno overlap in orchestration. Mastra is the preferred TypeScript-native orchestration layer; Agno is reserved for specialist durable workflows. Do not send every request to both.

## Safe rollout sequence

1. **Phaser**: dependency pinned, client-only preview adapter, runtime smoke-test panel. Complete the remaining gates above, then enable behind the registry.
2. **Mastra**: prototype one non-destructive workflow (task planning or evaluation) behind a server-side feature flag. Keep the current provider fallback chain and existing employee/task persistence. Do not migrate conversation history.
3. **Agno**: provision a separate Railway service only after credentials, resource budget, and data-retention settings are approved. Add a server-side authenticated adapter and human approval for external side effects.
4. **StemStudio**: deploy the editor and its required services independently, then embed the editor on a dedicated origin with restrictive CSP and sandboxing. Never expose its service credentials to the browser.
5. **VibeGame**: evaluate in a disposable sandbox first. Do not expose arbitrary shell, filesystem, browser, or coding-agent permissions to the production BuildApp worker.

## Non-negotiable safety and compatibility gates

- Never add credentials, tokens, database URLs, or provider keys to source control or client-side code.
- Never point these tools at the existing BuildApp production database.
- Never execute generated game HTML in the BuildApp origin. Keep preview in a sandboxed iframe and use a restrictive CSP.
- Never allow a generated game or agent to call arbitrary network destinations or read host files.
- Keep all five integrations feature-disabled until their adapter, tests, and deployment prerequisites are complete.
- Review transitive dependency licenses and security advisories at the exact pinned versions before distribution.
- Do not run `prisma db push --accept-data-loss`, migrations, or production deploys as part of this integration without a separately reviewed change.

## Current repository compatibility notes

BuildApp is a Next.js 16 / React 19 application using Bun and Prisma 6. Its existing provider layer already handles BYOK keys and fallback routing. New agent orchestration must sit above that layer rather than replacing it. The current Games Studio stores standalone HTML projects in the existing `GameProject` / `GameVersion` models; Phaser support must preserve those records and the existing HTML export route.

The PR currently targets `fix/railway-prisma-runtime`. Before merging, either confirm that this branch is the current deployment line, or retarget the PR to `main` after verifying that the Railway branch is fully merged into it.

## Optional provider: AshnaAI (Claude Sonnet 5)

BuildApp now has an opt-in server-side AshnaAI adapter in `src/lib/ai.ts`.

- API base: `https://api.ashna.ai/v1/api`
- Chat Completions endpoint: `POST /chat/completions`
- Default model: `claude-sonnet-5` (override with `ASHNA_MODEL_ID`)
- Secret: `ASHNA_API_KEY` (server-side only; never use a `NEXT_PUBLIC_` variable)
- Behavior: when `ASHNA_API_KEY` is present, `llm()` uses AshnaAI; when absent, the existing ZAI path remains unchanged.
- Failure behavior: AshnaAI errors are surfaced; prompts are not silently sent to a second provider.
- This adapter is non-streaming and preserves the existing `ChatMsg` interface.

### Enablement and cost controls

1. Create an API key in AshnaAI Account → API and store it as the Railway service variable `ASHNA_API_KEY`; do not commit it.
2. Optionally set `ASHNA_MODEL_ID=claude-sonnet-5`.
3. Confirm account entitlement and billing before enabling. The published model page currently lists paid token pricing; do not describe Claude Sonnet 5 as free.
4. Add provider-level quotas / spend limits before exposing this provider to all users.
5. Validate the endpoint with a low-token smoke test, then run lint and production build.

No API key, Railway variable, billing setting, or production deployment was changed as part of this code commit.

## AshnaAI multi-model catalogue integration

The AshnaAI integration is a provider gateway, not a Claude-only integration.

- `src/app/api/ai/models/route.ts` exposes a server-side proxy for AshnaAI's authenticated `GET /v1/api/models` catalogue. The browser never receives `ASHNA_API_KEY`.
- `llm(messages, maxTokens, model)` accepts an optional per-request model ID, so callers can select any model ID available to the configured AshnaAI API key.
- When no model is passed, the existing `ASHNA_MODEL_ID` setting is used; if unset, the current default remains `claude-sonnet-5`.
- The model catalogue returns model IDs and provider names, not authoritative per-model free-tier or account-entitlement metadata. Do not label every listed model as free. AshnaAI plans, credits, model availability and prices may differ by account and can change.
- A model appearing in the catalogue does not guarantee that the API key is entitled to use it; the completion endpoint can return a forbidden response.

Next UI step: add a model picker backed by `GET /api/ai/models`, pass the selected model ID to `llm()`, and display free/paid status only when AshnaAI supplies verifiable pricing/entitlement metadata or the account owner confirms it. Add usage limits and cost controls before exposing paid models to all users.

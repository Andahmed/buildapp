# Open-source game and agent stack

This plan extends the existing BuildApp application. It does not replace Next.js, Prisma, the current office/agent workflows, or the HTML5 Games Studio.

## Integration decisions

| Project | License checked | Role in BuildApp | Integration boundary | Initial state |
| --- | --- | --- | --- | --- |
| [Phaser](https://github.com/phaserjs/phaser) | MIT (repository package metadata) | Production 2D HTML5 runtime for games created in Games Studio | Add the npm package and lockfile together; mount only in a client-side game preview component | Planned; not installed yet |
| [StemStudio Engine](https://github.com/Stem-Studio/Engine) | MIT (repository LICENSE) | Optional 3D editor/runtime | Separate service or separately built static app; embed through a tightly sandboxed origin | Planned; separate deployment required |
| [VibeGame](https://github.com/tettethu/VibeGame) | Apache-2.0 (pyproject and README) | Research/build worker for prompt-to-game authoring | Isolated worker with per-job workspace, strict resource limits, artifact-only return path | Research only; do not run in production yet |
| [Mastra](https://github.com/mastra-ai/mastra) | Apache-2.0 (monorepo and @mastra/core metadata) | TypeScript agent orchestration, tools, memory and evaluations | Introduce selectively behind the existing provider and task interfaces | Planned; dependency and API compatibility tests required |
| [Agno](https://github.com/agno-agi/agno) | Apache-2.0 (README and LICENSE) | Optional durable specialist-agent service | Separate AgentOS API service; BuildApp calls it through an authenticated server-side adapter | Planned; separate deployment and credentials required |

## Why the integrations are not bundled into the web process

- StemStudio's OSS package runs a Vite editor plus Go AI server and a multiplayer service. Its package manifest also has a substantial dependency tree and postinstall work. It should not be copied into the Next.js server or the existing Railway service.
- VibeGame requires Python 3.12+, uv, tmux and a supported coding-agent CLI. Its README documents launching Claude Code with `--dangerously-skip-permissions`. That execution mode is not acceptable for a production multi-tenant worker. VibeGame remains disabled until its agent execution is redesigned around a restricted sandbox, explicit allowlists, time/resource limits, and human approval.
- Agno's current recommended platform is AgentOS, with its own API/MCP, PostgreSQL-backed state, auth, durable execution and approvals. It should have its own service and data store, not share BuildApp's Prisma database.
- Mastra and Agno overlap in orchestration. Mastra is the preferred TypeScript-native orchestration layer; Agno is reserved for specialist durable workflows. Do not send every request to both.

## Safe rollout sequence

1. **Phaser**: install a pinned compatible release using Bun, commit the matching `bun.lock`, add a client-only preview adapter, and keep the existing HTML5 preview/export path as fallback. Run build and mobile preview smoke tests.
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

BuildApp is a Next.js 16 / React 19 application using Bun and Prisma 6. Its existing provider layer already handles BYOK keys and fallback routing. New agent orchestration must sit above that layer rather than replacing it. The current Games Studio stores standalone HTML projects in the existing `GameProject` / `GameVersion` models; Phaser support should preserve those records and the existing HTML export route.

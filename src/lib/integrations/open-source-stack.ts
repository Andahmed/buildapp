/**
 * Registry for the approved open-source game/agent integrations.
 *
 * This is intentionally descriptive only: it does not start remote services,
 * read secrets, make network calls, or enable an integration. Each adapter
 * must be implemented and tested before its state can move to "ready".
 */
export type OpenSourceIntegrationId =
  | "phaser"
  | "stemstudio"
  | "vibegame"
  | "mastra"
  | "agno";

export type IntegrationState =
  | "planned"
  | "research-only"
  | "requires-separate-service";

export interface OpenSourceIntegration {
  id: OpenSourceIntegrationId;
  name: string;
  state: IntegrationState;
  enabled: false;
  boundary: "client-runtime" | "isolated-service" | "server-adapter";
}

export const OPEN_SOURCE_INTEGRATIONS: readonly OpenSourceIntegration[] = [
  {
    id: "phaser",
    name: "Phaser",
    state: "planned",
    enabled: false,
    boundary: "client-runtime",
  },
  {
    id: "stemstudio",
    name: "StemStudio",
    state: "requires-separate-service",
    enabled: false,
    boundary: "isolated-service",
  },
  {
    id: "vibegame",
    name: "VibeGame",
    state: "research-only",
    enabled: false,
    boundary: "isolated-service",
  },
  {
    id: "mastra",
    name: "Mastra",
    state: "planned",
    enabled: false,
    boundary: "server-adapter",
  },
  {
    id: "agno",
    name: "Agno",
    state: "requires-separate-service",
    enabled: false,
    boundary: "isolated-service",
  },
] as const;

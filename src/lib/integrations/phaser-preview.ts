"use client";

/**
 * Phaser client adapter (step 1 of the open-source stack rollout).
 *
 * Loads the Phaser 4.2.1 runtime in the browser only, mounts a game into an
 * existing canvas-like DOM node, and cleans up on unmount. It never runs on
 * the server, never reads secrets, and never touches the Prisma database.
 * The Games Studio keeps the existing HTML5 preview/export path as the
 * default fallback.
 */

import type * as PhaserTypes from "phaser";

export const PHASER_VERSION = "4.2.1";

type PhaserModule = typeof import("phaser");

let phaserPromise: Promise<PhaserModule> | null = null;

/** Lazily import the Phaser runtime on the client. Safe to call repeatedly. */
export function loadPhaser(): Promise<PhaserModule> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Phaser can only be loaded in the browser"));
  }
  if (!phaserPromise) {
    phaserPromise = import("phaser");
  }
  return phaserPromise;
}

export type PhaserPreviewHandle = {
  game: PhaserTypes.Phaser.Game | null;
  destroy: () => void;
};

/**
 * Mount a minimal Phaser game into a container element.
 * `createScene` is a factory so the caller controls all game logic.
 */
export async function mountPhaserPreview(
  container: HTMLElement,
  config: {
    width?: number;
    height?: number;
    backgroundColor?: string;
    createScene: (scene: PhaserTypes.Scene) => void;
  },
): Promise<PhaserPreviewHandle> {
  const Phaser = await loadPhaser();

  class PreviewScene extends Phaser.Scene {
    constructor() {
      super("preview");
    }

    create(): void {
      config.createScene(this);
    }
  }

  const game = new Phaser.Game({
    type: PhaserTypes.AUTO,
    parent: container,
    width: config.width ?? 390,
    height: config.height ?? 700,
    backgroundColor: config.backgroundColor ?? "#0f172a",
    scene: PreviewScene,
    // Mobile-friendly input.
    input: { activePointers: 2 },
  });

  return {
    game,
    destroy: () => {
      game.destroy(true);
      container.innerHTML = "";
    },
  };
}
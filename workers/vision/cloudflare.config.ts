import { bindings, defineConfig } from "cf/config";

import * as entrypoint from "./src/index.ts" with { type: "cf-worker" };

export default defineConfig({
  worker: {
    name: "nourish-vision",
    compatibilityDate: "2026-11-01",
    entrypoint,
    env: {
      AI: bindings.ai(),
      VISION_SECRET: bindings.secret(),
    },
  },
});

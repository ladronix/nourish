import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

// Local overrides first (dotenv never overwrites): .env.development.local points at docker Postgres.
config({ path: ".env.development.local" });
config({ path: ".env.local" });

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url: process.env.DATABASE_URL ?? "postgres://nourish:nourish@localhost:5434/nourish" },
});

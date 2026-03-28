import fs from "fs";
import path from "path";
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { apiRouter } from "./routes/api";
import { errorHandler } from "./middleware/errorHandler";
import { bootstrapDatabase } from "./services/databaseBootstrap";
import { voiceWebhookController } from "./controllers/voiceWebhookController";
import type { Router } from "express";

/**
 * Monorepo root `.env` — works for `tsx index.ts` (__dirname = backend/)
 * and `node dist/index.js` (__dirname = backend/dist/).
 * `override: true` so values in `.env` win over stale Windows/shell env vars
 * (e.g. old VAPI_PHONE_NUMBER_ID).
 */
function resolveRootEnvPath(): string {
  if (path.basename(__dirname) === "dist") {
    return path.resolve(__dirname, "../../.env");
  }
  return path.resolve(__dirname, "../.env");
}

const envPath = resolveRootEnvPath();
if (!fs.existsSync(envPath)) {
  // eslint-disable-next-line no-console
  console.warn(`[env] Missing file: ${envPath}`);
}
dotenv.config({ path: envPath, override: true });

const app = express();

app.use(
  cors({
    origin: process.env.CORS_ORIGIN,
    credentials: true,
  })
);
app.use(express.json({ limit: "1mb" }));

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.use("/api", apiRouter);

// Voice routes (Vapi) — continues the same chat session via phone
// eslint-disable-next-line @typescript-eslint/no-var-requires
const voiceRoutes: Router = require("./routes/voiceRoutes");
app.use("/api/voice", voiceRoutes);
/** Vapi Server URL — tool-calls (book appointment). Configure in Vapi dashboard. */
app.post("/api/voice/webhook", voiceWebhookController);

app.use(errorHandler);

const port = Number(process.env.PORT ?? 4000);

async function start() {
  try {
    await bootstrapDatabase();
    // eslint-disable-next-line no-console
    console.log("Database schema/seed ensured.");
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("Database bootstrap failed:", error);
  }

  // Bind 0.0.0.0 so Docker / Hugging Face Spaces can route traffic to the container
  app.listen(port, "0.0.0.0", () => {
    // eslint-disable-next-line no-console
    console.log(`Backend listening on http://0.0.0.0:${port}`);
    // eslint-disable-next-line no-console
    console.log(
      `[env] Loaded ${envPath} | VAPI_PHONE_NUMBER_ID=${process.env.VAPI_PHONE_NUMBER_ID ?? "(unset)"}`
    );
  });
}

void start();


"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const dotenv_1 = __importDefault(require("dotenv"));
const api_1 = require("./routes/api");
const errorHandler_1 = require("./middleware/errorHandler");
const databaseBootstrap_1 = require("./services/databaseBootstrap");
const voiceWebhookController_1 = require("./controllers/voiceWebhookController");
/**
 * Monorepo root `.env` — works for `tsx index.ts` (__dirname = backend/)
 * and `node dist/index.js` (__dirname = backend/dist/).
 * `override: true` so values in `.env` win over stale Windows/shell env vars
 * (e.g. old VAPI_PHONE_NUMBER_ID).
 */
function resolveRootEnvPath() {
    if (path_1.default.basename(__dirname) === "dist") {
        return path_1.default.resolve(__dirname, "../../.env");
    }
    return path_1.default.resolve(__dirname, "../.env");
}
const envPath = resolveRootEnvPath();
if (!fs_1.default.existsSync(envPath)) {
    // eslint-disable-next-line no-console
    console.warn(`[env] Missing file: ${envPath}`);
}
dotenv_1.default.config({ path: envPath, override: true });
const app = (0, express_1.default)();
app.use((0, cors_1.default)({
    origin: process.env.CORS_ORIGIN,
    credentials: true,
}));
app.use(express_1.default.json({ limit: "1mb" }));
app.get("/health", (_req, res) => {
    res.json({ ok: true });
});
app.use("/api", api_1.apiRouter);
// Voice routes (Vapi) — continues the same chat session via phone
// eslint-disable-next-line @typescript-eslint/no-var-requires
const voiceRoutes = require("./routes/voiceRoutes");
app.use("/api/voice", voiceRoutes);
/** Vapi Server URL — tool-calls (book appointment). Configure in Vapi dashboard. */
app.post("/api/voice/webhook", voiceWebhookController_1.voiceWebhookController);
app.use(errorHandler_1.errorHandler);
const port = Number(process.env.PORT ?? 4000);
async function start() {
    try {
        await (0, databaseBootstrap_1.bootstrapDatabase)();
        // eslint-disable-next-line no-console
        console.log("Database schema/seed ensured.");
    }
    catch (error) {
        // eslint-disable-next-line no-console
        console.error("Database bootstrap failed:", error);
    }
    // Bind 0.0.0.0 so Docker / Hugging Face Spaces can route traffic to the container
    app.listen(port, "0.0.0.0", () => {
        // eslint-disable-next-line no-console
        console.log(`Backend listening on http://0.0.0.0:${port}`);
        // eslint-disable-next-line no-console
        console.log(`[env] Loaded ${envPath} | VAPI_PHONE_NUMBER_ID=${process.env.VAPI_PHONE_NUMBER_ID ?? "(unset)"}`);
    });
}
void start();

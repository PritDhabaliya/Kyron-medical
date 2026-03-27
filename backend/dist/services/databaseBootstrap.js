"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.bootstrapDatabase = bootstrapDatabase;
const promises_1 = __importDefault(require("fs/promises"));
const path_1 = __importDefault(require("path"));
const db_1 = require("../models/db");
async function bootstrapDatabase() {
    const rootDir = path_1.default.resolve(__dirname, "../../");
    const schemaPath = path_1.default.join(rootDir, "database", "schema.sql");
    const seedPath = path_1.default.join(rootDir, "database", "seed.sql");
    const schemaSql = await promises_1.default.readFile(schemaPath, "utf8");
    const seedSql = await promises_1.default.readFile(seedPath, "utf8");
    await db_1.pool.query(schemaSql);
    try {
        await db_1.pool.query(seedSql);
    }
    catch (error) {
        // Existing Supabase projects may already have legacy doctor rows/ids.
        // We do not want seed failures to block app startup.
        // eslint-disable-next-line no-console
        console.warn("Database seed skipped:", error);
    }
}

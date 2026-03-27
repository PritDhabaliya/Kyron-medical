"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.pool = void 0;
exports.query = query;
const pg_1 = require("pg");
let poolInstance = null;
function getPool() {
    if (!poolInstance) {
        // Supabase typically requires SSL. RejectUnauthorized=false works for managed SSL.
        poolInstance = new pg_1.Pool({
            connectionString: process.env.DATABASE_URL,
            ssl: { rejectUnauthorized: false },
        });
    }
    return poolInstance;
}
exports.pool = new Proxy({}, {
    get(_target, prop, receiver) {
        return Reflect.get(getPool(), prop, receiver);
    },
});
async function query(text, params) {
    const result = await getPool().query(text, params);
    return result;
}

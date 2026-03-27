"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.errorHandler = errorHandler;
function errorHandler(err, _req, res, _next) {
    // In production you would remove stack traces or gate them behind NODE_ENV.
    const message = err instanceof Error && err.message
        ? err.message
        : "Unexpected backend error";
    // eslint-disable-next-line no-console
    console.error(err);
    res.status(500).json({ error: message });
}

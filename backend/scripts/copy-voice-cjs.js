/**
 * tsc only emits .ts files. voiceRoutes + voiceController are plain .js — copy into dist/ for `node dist/index.js`.
 */
const fs = require("fs");
const path = require("path");

const backendRoot = path.join(__dirname, "..");

function copy(relFrom, relTo) {
  const from = path.join(backendRoot, relFrom);
  const to = path.join(backendRoot, relTo);
  if (!fs.existsSync(from)) {
    console.error("Missing source file:", from);
    process.exit(1);
  }
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
  console.log("copy:", relFrom, "->", relTo);
}

copy("routes/voiceRoutes.js", "dist/routes/voiceRoutes.js");
copy("controllers/voiceController.js", "dist/controllers/voiceController.js");

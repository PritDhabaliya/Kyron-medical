/**
 * Voice routes
 * POST /api/voice/call
 */

const express = require("express");
const { voiceController } = require("../controllers/voiceController");

const router = express.Router();

router.post("/call", voiceController);

module.exports = router;


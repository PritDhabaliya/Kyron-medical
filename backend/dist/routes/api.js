"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.apiRouter = void 0;
const express_1 = require("express");
const chatController_1 = require("../controllers/chatController");
const doctorsController_1 = require("../controllers/doctorsController");
const availabilityController_1 = require("../controllers/availabilityController");
const patientController_1 = require("../controllers/patientController");
const appointmentController_1 = require("../controllers/appointmentController");
exports.apiRouter = (0, express_1.Router)();
exports.apiRouter.get("/chat", (_req, res) => {
    res.status(405).json({
        error: "Use POST /api/chat with { user_message, session_id }",
    });
});
exports.apiRouter.post("/chat", chatController_1.chatController);
exports.apiRouter.post("/patient", patientController_1.patientController);
exports.apiRouter.get("/doctors", doctorsController_1.doctorsController);
exports.apiRouter.get("/availability", availabilityController_1.availabilityController);
exports.apiRouter.post("/appointment", appointmentController_1.appointmentController);

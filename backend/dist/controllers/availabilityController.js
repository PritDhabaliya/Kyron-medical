"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.availabilityController = availabilityController;
const db_1 = require("../models/db");
const availabilityService_1 = require("../services/availabilityService");
function getDoctorId(req) {
    const raw = (req.query.doctor_id ?? req.query.doctorId);
    return raw ?? null;
}
async function availabilityController(req, res) {
    const doctorId = getDoctorId(req);
    if (!doctorId) {
        res.status(400).json({ error: "Missing required query param: doctor_id" });
        return;
    }
    const doctor = await (0, db_1.query)(`select id, name, specialty, body_part from doctors where id = $1`, [doctorId]);
    if (!doctor.rows[0]) {
        res.status(404).json({ error: "Doctor not found" });
        return;
    }
    const slots = (0, availabilityService_1.generateSlotsForDoctor)({
        doctorName: doctor.rows[0].name,
        daysAhead: 45,
    });
    res.json({
        doctor: doctor.rows[0],
        slots,
    });
}

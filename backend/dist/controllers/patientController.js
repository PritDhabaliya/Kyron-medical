"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.patientController = patientController;
const zod_1 = require("zod");
const patientService_1 = require("../services/patientService");
const PatientSchema = zod_1.z.object({
    first_name: zod_1.z.string().min(1),
    last_name: zod_1.z.string().min(1),
    dob: zod_1.z.string().min(4), // YYYY-MM-DD
    phone: zod_1.z.string().min(5),
    email: zod_1.z.string().email(),
});
async function patientController(req, res) {
    const parse = PatientSchema.safeParse(req.body);
    if (!parse.success) {
        res.status(400).json({ error: parse.error.flatten() });
        return;
    }
    const patient = await (0, patientService_1.upsertPatientByPhone)(parse.data);
    res.json({ patient });
}

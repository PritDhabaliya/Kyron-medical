"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.appointmentController = appointmentController;
const zod_1 = require("zod");
const appointmentBookingService_1 = require("../services/appointmentBookingService");
const PatientInputSchema = zod_1.z.object({
    first_name: zod_1.z.string().min(1),
    last_name: zod_1.z.string().min(1),
    dob: zod_1.z.string().min(4), // YYYY-MM-DD
    phone: zod_1.z.string().min(5),
    email: zod_1.z.string().email(),
});
const AppointmentSchema = zod_1.z
    .object({
    patient_id: zod_1.z.coerce.string().optional(),
    patient: PatientInputSchema.optional(),
    doctor_id: zod_1.z.coerce.string().min(1),
    appointment_date: zod_1.z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    appointment_time: zod_1.z.string().regex(/^\d{2}:\d{2}$/),
    reason: zod_1.z.string().optional(),
    send_sms_reminder: zod_1.z.boolean().optional(),
    session_id: zod_1.z.string().optional(),
})
    .refine((data) => Boolean(data.patient_id) || Boolean(data.patient) || Boolean(data.session_id), { message: "Provide either patient_id, patient, or session_id" });
async function appointmentController(req, res) {
    const parse = AppointmentSchema.safeParse(req.body);
    if (!parse.success) {
        res.status(400).json({ error: parse.error.flatten() });
        return;
    }
    const { patient_id, patient, doctor_id, appointment_date, appointment_time, reason, send_sms_reminder, session_id, } = parse.data;
    const booked = await (0, appointmentBookingService_1.bookAppointment)({
        patient_id,
        patient,
        doctor_id,
        appointment_date,
        appointment_time,
        reason,
        send_sms_reminder,
        session_id,
    });
    if (!booked.ok) {
        res.status(booked.httpStatus).json({ error: booked.error });
        return;
    }
    res.json({
        appointment: booked.appointment,
        smsPrompt: booked.smsPrompt,
        doctor_name: booked.doctor_name,
    });
}

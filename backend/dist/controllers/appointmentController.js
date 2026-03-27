"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.appointmentController = appointmentController;
const zod_1 = require("zod");
const db_1 = require("../models/db");
const emailService_1 = require("../services/emailService");
const smsService_1 = require("../services/smsService");
const patientService_1 = require("../services/patientService");
const patientExtraction_1 = require("../services/patientExtraction");
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
    const doctorResult = await (0, db_1.query)(`select id, name, specialty, body_part from doctors where id = $1`, [doctor_id]);
    if (!doctorResult.rows[0]) {
        res.status(404).json({ error: "Doctor not found" });
        return;
    }
    const doctor = doctorResult.rows[0];
    let finalPatientId = patient_id ?? null;
    let finalPatientEmail = null;
    let finalPatientPhone = null;
    let finalPatientFirstName = null;
    let finalPatientLastName = null;
    if (!finalPatientId && patient) {
        const patientRow = await (0, patientService_1.upsertPatientByPhone)(patient);
        finalPatientId = patientRow.id;
        finalPatientEmail = patientRow.email;
        finalPatientPhone = patientRow.phone;
        finalPatientFirstName = patientRow.first_name;
        finalPatientLastName = patientRow.last_name;
    }
    else if (!finalPatientId && !patient && session_id) {
        const session = await (0, db_1.query)(`select conversation_history from chat_sessions where session_id = $1`, [session_id]);
        const history = session.rows[0]?.conversation_history ?? [];
        const extracted = (0, patientExtraction_1.extractPatientFromHistory)(history);
        if (!extracted.first_name ||
            !extracted.last_name ||
            !extracted.dob ||
            !extracted.phone ||
            !extracted.email) {
            // eslint-disable-next-line no-console
            console.error("Patient extraction failed:", {
                first_name: extracted.first_name,
                last_name: extracted.last_name,
                dob: extracted.dob,
                phone: extracted.phone,
                email: extracted.email,
            });
            res.status(400).json({
                error: "Missing patient details in chat session. Please complete the patient information question first.",
            });
            return;
        }
        const patientRow = await (0, patientService_1.upsertPatientByPhone)(extracted);
        finalPatientId = patientRow.id;
        finalPatientEmail = patientRow.email;
        finalPatientPhone = patientRow.phone;
        finalPatientFirstName = patientRow.first_name;
        finalPatientLastName = patientRow.last_name;
    }
    else if (finalPatientId) {
        const patientResult = await (0, db_1.query)(`select id, first_name, last_name, phone, email
       from patients
       where id = $1`, [finalPatientId]);
        if (!patientResult.rows[0]) {
            res.status(404).json({ error: "Patient not found" });
            return;
        }
        finalPatientEmail = patientResult.rows[0].email;
        finalPatientPhone = patientResult.rows[0].phone;
        finalPatientFirstName = patientResult.rows[0].first_name;
        finalPatientLastName = patientResult.rows[0].last_name;
    }
    if (!finalPatientId) {
        res.status(400).json({ error: "Missing patient" });
        return;
    }
    const apptResult = await (0, db_1.query)(`select id
      from appointments
      where doctor_id = $1
        and appointment_date::date = $2::date
        and to_char(appointment_time, 'HH24:MI') = $3
      limit 1`, [doctor_id, appointment_date, appointment_time]);
    if (apptResult.rows[0]) {
        res.status(409).json({
            error: "That slot is already booked. Please choose another available slot.",
        });
        return;
    }
    const insertResult = await (0, db_1.query)(`insert into appointments (patient_id, doctor_id, appointment_date, appointment_time, reason)
     values ($1, $2, $3, $4, $5)
     returning *`, [finalPatientId, doctor_id, appointment_date, appointment_time, reason ?? null]);
    const appointment = insertResult.rows[0];
    const patientName = [finalPatientFirstName, finalPatientLastName].filter(Boolean).join(" ");
    // Email confirmation (required by spec)
    if (finalPatientEmail) {
        await (0, emailService_1.sendAppointmentEmail)({
            toEmail: finalPatientEmail,
            toName: patientName,
            doctorName: doctor.name,
            appointmentDate: appointment_date,
            appointmentTime: appointment_time,
        });
    }
    // Optional SMS reminders
    if (send_sms_reminder && finalPatientPhone) {
        await (0, db_1.query)(`update patients
       set sms_reminders_opt_in = true
       where id = $1`, [finalPatientId]).catch(() => null);
        await (0, smsService_1.sendAppointmentSms)({
            toPhone: finalPatientPhone,
            doctorName: doctor.name,
            appointmentDate: appointment_date,
            appointmentTime: appointment_time,
        });
    }
    const smsPrompt = `Your appointment is confirmed with ${doctor.name} on ${appointment_date} at ${appointment_time}. ` +
        "Would you like SMS reminder notifications as well? (yes/no)";
    // If booking came from an AI chat session, append the SMS prompt into the conversation
    // so that the next "yes/no" message works the same as chat-based booking.
    if (session_id) {
        await (0, db_1.query)(`update chat_sessions set patient_id = $1 where session_id = $2`, [finalPatientId, session_id]);
        const session = await (0, db_1.query)(`select conversation_history from chat_sessions where session_id = $1`, [session_id]);
        const history = Array.isArray(session.rows[0]?.conversation_history)
            ? session.rows[0].conversation_history
            : [];
        const nextHistory = [
            ...history,
            { role: "assistant", content: smsPrompt },
        ];
        await (0, db_1.query)(`update chat_sessions set conversation_history = $1::jsonb where session_id = $2`, [JSON.stringify(nextHistory), session_id]);
    }
    res.json({ appointment, smsPrompt, doctor_name: doctor.name });
}

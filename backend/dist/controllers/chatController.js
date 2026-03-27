"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.chatController = chatController;
const zod_1 = require("zod");
const db_1 = require("../models/db");
const availabilityService_1 = require("../services/availabilityService");
const symptomToSpecialty_1 = require("../services/symptomToSpecialty");
const emailService_1 = require("../services/emailService");
const smsService_1 = require("../services/smsService");
const openaiService_1 = require("../services/openaiService");
const patientService_1 = require("../services/patientService");
const patientExtraction_1 = require("../services/patientExtraction");
const ChatSchema = zod_1.z.object({
    user_message: zod_1.z.string().min(1),
    session_id: zod_1.z.string().min(1),
});
async function filterBookedSlots(doctorId, slots) {
    const available = [];
    for (const s of slots) {
        const existing = await (0, db_1.query)(`select 1
       from appointments
       where doctor_id = $1
         and appointment_date::date = $2::date
         and to_char(appointment_time, 'HH24:MI') = $3
       limit 1`, [doctorId, s.appointment_date, s.appointment_time]);
        if (!existing.rows[0])
            available.push(s);
    }
    return available;
}
function parseTimeTo24h(value) {
    const text = value.trim().toLowerCase();
    const m = text.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i);
    if (!m)
        return null;
    let hh = Number(m[1]);
    const mm = m[2] ? Number(m[2]) : 0;
    const ampm = m[3];
    if (hh > 23 || mm > 59)
        return null;
    if (ampm === "pm" && hh < 12)
        hh += 12;
    if (ampm === "am" && hh === 12)
        hh = 0;
    return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}
function parseRequestedDateTime(message) {
    const lower = message.toLowerCase();
    const tm = lower.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)/i);
    if (!tm)
        return null;
    const parsedTime = parseTimeTo24h(`${tm[1]}:${tm[2] ?? "00"} ${tm[3]}`);
    if (!parsedTime)
        return null;
    if (lower.includes("tomorrow")) {
        const d = new Date();
        d.setDate(d.getDate() + 1);
        const iso = d.toISOString().slice(0, 10);
        return { date: iso, time: parsedTime };
    }
    const ymd = message.match(/\b(\d{4}-\d{2}-\d{2})\b/);
    if (ymd)
        return { date: ymd[1], time: parsedTime };
    const mdy = message.match(/\b(\d{1,2}\/\d{1,2}\/\d{4})\b/);
    if (mdy) {
        const iso = (0, patientExtraction_1.parseDateToIso)(mdy[1]);
        if (!iso)
            return null;
        return { date: iso, time: parsedTime };
    }
    return null;
}
async function chatController(req, res) {
    try {
        const parse = ChatSchema.safeParse(req.body);
        if (!parse.success) {
            res.status(400).json({ error: parse.error.flatten() });
            return;
        }
        const { user_message, session_id } = parse.data;
        // Load or create session
        const existing = await (0, db_1.query)(`select id, patient_id, conversation_history
       from chat_sessions
       where session_id = $1`, [session_id]);
        let sessionRow = existing.rows[0];
        if (!sessionRow) {
            const created = await (0, db_1.query)(`insert into chat_sessions (session_id, conversation_history)
         values ($1, '[]'::jsonb)
         returning id, patient_id, conversation_history`, [session_id]);
            sessionRow = created.rows[0];
        }
        const history = Array.isArray(sessionRow.conversation_history)
            ? sessionRow.conversation_history
            : [];
        const updatedHistory = [...history, { role: "user", content: user_message }];
        // If user responds "yes/no" after a booking, treat it as SMS opt-in/out.
        // We keep the original prompt check, but also support the case where the
        // prompt text varies (or user responds after booking confirmation).
        const latestAssistant = [...history]
            .reverse()
            .find((m) => m.role === "assistant")?.content
            ?.toLowerCase();
        const msgLower = user_message.toLowerCase();
        const smsDecision = /\b(yes|yeah|yep|sure)\b/i.test(msgLower) ? "yes" : /\b(no|nope|nah)\b/i.test(msgLower) ? "no" : null;
        // Resolve patient_id once (we need it for both opt-in update and SMS send).
        const sessionWithPatient = await (0, db_1.query)(`select patient_id from chat_sessions where id = $1`, [sessionRow.id]);
        const patientId = sessionWithPatient.rows[0]?.patient_id;
        let hasRecentAppointment = false;
        if (patientId) {
            const recent = await (0, db_1.query)(`select 1
         from appointments
         where patient_id = $1
         order by created_at desc
         limit 1`, [patientId]);
            hasRecentAppointment = (recent.rowCount ?? 0) > 0;
        }
        if (smsDecision &&
            (latestAssistant?.includes("sms reminder") || hasRecentAppointment)) {
            if (smsDecision === "yes") {
                if (patientId) {
                    // Persist opt-in on the patient record (column exists in your Supabase)
                    await (0, db_1.query)(`update patients
             set sms_reminders_opt_in = true
             where id = $1`, [patientId]).catch(() => null);
                    const details = await (0, db_1.query)(`select p.phone,
                    p.first_name,
                    p.last_name,
                    d.name as doctor_name,
                    a.appointment_date::text as appointment_date,
                    to_char(a.appointment_time, 'HH24:MI') as appointment_time
             from appointments a
             join patients p on p.id = a.patient_id
             join doctors d on d.id = a.doctor_id
             where a.patient_id = $1
             order by a.created_at desc
             limit 1`, [patientId]);
                    if (details.rows[0]) {
                        await (0, smsService_1.sendAppointmentSms)({
                            toPhone: details.rows[0].phone,
                            doctorName: details.rows[0].doctor_name,
                            appointmentDate: details.rows[0].appointment_date,
                            appointmentTime: details.rows[0].appointment_time,
                        });
                    }
                }
                const reply = "Perfect. SMS reminder is enabled. Thank you for choosing Kyron Medical.";
                const nextHistory = [...updatedHistory, { role: "assistant", content: reply }];
                await (0, db_1.query)(`update chat_sessions set conversation_history = $1::jsonb where id = $2`, [JSON.stringify(nextHistory), sessionRow.id]);
                res.json({ reply, session_id });
                return;
            }
            // smsDecision === "no"
            if (patientId) {
                await (0, db_1.query)(`update patients
           set sms_reminders_opt_in = false
           where id = $1`, [patientId]).catch(() => null);
            }
            const reply = "No problem. Your appointment is confirmed. Thank you for choosing Kyron Medical.";
            const nextHistory = [...updatedHistory, { role: "assistant", content: reply }];
            await (0, db_1.query)(`update chat_sessions set conversation_history = $1::jsonb where id = $2`, [JSON.stringify(nextHistory), sessionRow.id]);
            res.json({ reply, session_id });
            return;
        }
        // Use GPT to decide what to do next (ask info / offer slots / book)
        const assistantOutput = await (0, openaiService_1.generateChatAssistantOutput)({
            userMessage: user_message,
            conversationHistory: updatedHistory.slice(-20),
        });
        const assistantReply = assistantOutput.reply;
        const nextHistory = [
            ...updatedHistory,
            { role: "assistant", content: assistantReply },
        ];
        // Persist conversation
        await (0, db_1.query)(`update chat_sessions
       set conversation_history = $1::jsonb
       where id = $2`, [JSON.stringify(nextHistory), sessionRow.id]);
        const extracted = assistantOutput.extracted ?? {};
        // Helper: infer specialty from full conversation if GPT didn't provide.
        const fullText = updatedHistory.map((m) => m.content).join("\n");
        const specialty = (0, symptomToSpecialty_1.normalizeSpecialty)(extracted.specialty) ??
            extracted.specialty ??
            (0, symptomToSpecialty_1.inferSpecialtyFromMessage)(user_message) ??
            (0, symptomToSpecialty_1.inferSpecialtyFromMessage)(fullText) ??
            undefined;
        const parsedPatient = (0, patientExtraction_1.extractPatientFromHistory)(updatedHistory);
        const patientOk = Boolean(parsedPatient.last_name) &&
            Boolean(parsedPatient.dob) &&
            Boolean(parsedPatient.phone) &&
            Boolean(parsedPatient.email);
        const requestedDateTime = parseRequestedDateTime(user_message);
        const slotIntent = /\b(available\s+slot|available\s+slots|available\s+time|slots|slot\s+options|appointment\s+slots)\b/i.test(user_message) || /\b(what\s+slots|what\s+available|available\s+slot)\b/i.test(user_message);
        // Offer slot options if we have specialty
        if (assistantOutput.action === "offer_slots" ||
            assistantOutput.action === "request_patient_info") {
            if (!specialty) {
                res.json({ reply: assistantReply, session_id });
                return;
            }
            // Only reveal appointment slots after the user provides the required patient details
            // (last name, DOB, phone, email).
            if (!patientOk) {
                res.json({ reply: assistantReply, session_id });
                return;
            }
            const doctors = await (0, db_1.query)(`select id, name from doctors where lower(specialty) = lower($1) order by name`, [specialty]);
            const primaryDoctor = doctors.rows[0];
            if (!primaryDoctor) {
                res.json({ reply: assistantReply, session_id });
                return;
            }
            const slotsAll = (0, availabilityService_1.generateSlotsForDoctor)({
                doctorName: primaryDoctor.name,
                daysAhead: 14,
            });
            const slotsAvailable = await filterBookedSlots(primaryDoctor.id, slotsAll);
            const slots = slotsAvailable.slice(0, 4);
            const thanksName = parsedPatient.first_name || parsedPatient.last_name || "there";
            const slotReply = `Thanks for the details, ${thanksName}. Here are the available appointment slots for ${specialty}:`;
            // Replace the assistant message we already persisted with the slotReply
            await (0, db_1.query)(`update chat_sessions
         set conversation_history = $1::jsonb
         where id = $2`, [JSON.stringify([...updatedHistory, { role: "assistant", content: slotReply }]), sessionRow.id]);
            if (slots.length === 0) {
                res.json({
                    reply: "Sorry, there are no available slots for this specialist right now. Please try a different time or ask me again later.",
                    session_id,
                });
                return;
            }
            res.json({
                reply: slotReply,
                session_id,
                appointmentOptions: {
                    doctor: primaryDoctor,
                    slots,
                },
            });
            return;
        }
        // If the user explicitly asks for available slots and we already have
        // patient details + specialty, return slot options immediately (no need
        // to rely on model action classification).
        if (specialty && patientOk && slotIntent) {
            const doctors = await (0, db_1.query)(`select id, name from doctors where lower(specialty) = lower($1) order by name`, [specialty]);
            const primaryDoctor = doctors.rows[0];
            if (!primaryDoctor) {
                res.json({ reply: assistantReply, session_id });
                return;
            }
            const slotsAll = (0, availabilityService_1.generateSlotsForDoctor)({
                doctorName: primaryDoctor.name,
                daysAhead: 14,
            });
            const slotsAvailable = await filterBookedSlots(primaryDoctor.id, slotsAll);
            const slots = slotsAvailable.slice(0, 4);
            const thanksName = parsedPatient.first_name || parsedPatient.last_name || "there";
            const slotReply = `Thanks for the details, ${thanksName}. Here are the available appointment slots for ${specialty}:`;
            await (0, db_1.query)(`update chat_sessions
         set conversation_history = $1::jsonb
         where id = $2`, [
                JSON.stringify([
                    ...updatedHistory,
                    { role: "assistant", content: slotReply },
                ]),
                sessionRow.id,
            ]);
            if (slots.length === 0) {
                res.json({
                    reply: "Sorry, there are no available slots for this specialist right now. Please try a different time or ask me again later.",
                    session_id,
                });
                return;
            }
            res.json({
                reply: slotReply,
                session_id,
                appointmentOptions: {
                    doctor: primaryDoctor,
                    slots,
                },
            });
            return;
        }
        // Deterministic booking when patient details + specialty + requested date/time exist.
        if (specialty &&
            parsedPatient.first_name &&
            parsedPatient.last_name &&
            parsedPatient.dob &&
            parsedPatient.phone &&
            parsedPatient.email &&
            requestedDateTime) {
            const doctor = await (0, db_1.query)(`select id, name from doctors where lower(specialty) = lower($1) order by name limit 1`, [specialty]);
            const doctorRow = doctor.rows[0];
            if (!doctorRow) {
                res.json({ reply: "I could not find a matching doctor right now.", session_id });
                return;
            }
            const patientRow = await (0, patientService_1.upsertPatientByPhone)(parsedPatient);
            const appointment = await (0, db_1.query)(`insert into appointments (patient_id, doctor_id, appointment_date, appointment_time, reason)
         values ($1, $2, $3, $4, $5)
         returning *`, [
                patientRow.id,
                doctorRow.id,
                requestedDateTime.date,
                requestedDateTime.time,
                extracted.reason ?? user_message,
            ]);
            await (0, db_1.query)(`update chat_sessions set patient_id = $1 where id = $2`, [
                patientRow.id,
                sessionRow.id,
            ]);
            await (0, emailService_1.sendAppointmentEmail)({
                toEmail: patientRow.email,
                toName: `${patientRow.first_name} ${patientRow.last_name}`,
                doctorName: doctorRow.name,
                appointmentDate: requestedDateTime.date,
                appointmentTime: requestedDateTime.time,
            });
            const reply = `Your appointment is confirmed with ${doctorRow.name} on ${requestedDateTime.date} at ${requestedDateTime.time}. ` +
                "Would you like SMS reminder notifications as well? (yes/no)";
            const finalHistory = [...updatedHistory, { role: "assistant", content: reply }];
            await (0, db_1.query)(`update chat_sessions set conversation_history = $1::jsonb where id = $2`, [JSON.stringify(finalHistory), sessionRow.id]);
            res.json({
                reply,
                session_id,
                booked: { appointment: appointment.rows[0], doctor_name: doctorRow.name },
            });
            return;
        }
        // Book appointment if GPT asks for it and provides date/time
        if (assistantOutput.action === "book_appointment" &&
            extracted.appointment_date &&
            extracted.appointment_time &&
            specialty &&
            extracted.phone &&
            extracted.email &&
            extracted.first_name &&
            extracted.last_name &&
            extracted.dob) {
            const doctor = await (0, db_1.query)(`select id, name from doctors where lower(specialty) = lower($1) order by name limit 1`, [specialty]);
            const doctorRow = doctor.rows[0];
            if (!doctorRow) {
                res.json({ reply: assistantReply, session_id });
                return;
            }
            // Upsert patient by phone (schema should enforce uniqueness)
            const patientRow = await (0, patientService_1.upsertPatientByPhone)({
                first_name: extracted.first_name,
                last_name: extracted.last_name,
                dob: extracted.dob,
                phone: extracted.phone,
                email: extracted.email,
            });
            const appointment = await (0, db_1.query)(`insert into appointments (patient_id, doctor_id, appointment_date, appointment_time, reason)
         values ($1, $2, $3, $4, $5)
         returning *`, [
                patientRow.id,
                doctorRow.id,
                extracted.appointment_date,
                extracted.appointment_time,
                extracted.reason ?? user_message,
            ]);
            await (0, emailService_1.sendAppointmentEmail)({
                toEmail: patientRow.email,
                toName: `${patientRow.first_name} ${patientRow.last_name}`,
                doctorName: doctorRow.name,
                appointmentDate: extracted.appointment_date,
                appointmentTime: extracted.appointment_time,
            });
            res.json({
                reply: assistantReply,
                session_id,
                booked: { appointment: appointment.rows[0], doctor_name: doctorRow.name },
            });
            return;
        }
        // If specialty known and user asks for "tomorrow at X", but missing patient details,
        // ask specifically for the remaining fields and still send slots.
        if (specialty && requestedDateTime && (!parsedPatient.phone || !parsedPatient.email)) {
            const doctors = await (0, db_1.query)(`select id, name from doctors where lower(specialty) = lower($1) order by name`, [specialty]);
            const primaryDoctor = doctors.rows[0];
            const slots = primaryDoctor
                ? (0, availabilityService_1.generateSlotsForDoctor)({ doctorName: primaryDoctor.name, daysAhead: 14 }).slice(0, 4)
                : [];
            res.json({
                reply: "Great, I can schedule that. Please share your last name, date of birth, phone number, and email to confirm the booking.",
                session_id,
                appointmentOptions: primaryDoctor ? { doctor: primaryDoctor, slots } : undefined,
            });
            return;
        }
        // If the user has already provided the required patient details but GPT didn't
        // explicitly choose `offer_slots`, still show available slots for the specialty.
        if (specialty && patientOk && !requestedDateTime) {
            const doctors = await (0, db_1.query)(`select id, name from doctors where lower(specialty) = lower($1) order by name`, [specialty]);
            const primaryDoctor = doctors.rows[0];
            if (primaryDoctor) {
                const slots = (0, availabilityService_1.generateSlotsForDoctor)({
                    doctorName: primaryDoctor.name,
                    daysAhead: 14,
                }).slice(0, 4);
                const thanksName = parsedPatient.first_name || parsedPatient.last_name || "there";
                const slotReply = `Thanks for the details, ${thanksName}. Here are the available appointment slots for ${specialty}:`;
                // Replace the persisted assistant message with our slotReply
                await (0, db_1.query)(`update chat_sessions
           set conversation_history = $1::jsonb
           where id = $2`, [
                    JSON.stringify([...updatedHistory, { role: "assistant", content: slotReply }]),
                    sessionRow.id,
                ]);
                res.json({
                    reply: slotReply,
                    session_id,
                    appointmentOptions: {
                        doctor: primaryDoctor,
                        slots,
                    },
                });
                return;
            }
        }
        res.json({ reply: assistantReply, session_id });
    }
    catch (error) {
        // eslint-disable-next-line no-console
        console.error("chatController error:", error);
        res.status(500).json({
            error: "Chat is temporarily unavailable. Please try again in a moment.",
            reply: "I can still help schedule your appointment. Please share your symptoms and preferred date/time.",
        });
    }
}

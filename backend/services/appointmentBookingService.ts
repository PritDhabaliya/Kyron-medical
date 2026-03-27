import { query } from "../models/db";
import { sendAppointmentEmail } from "./emailService";
import { sendAppointmentSms } from "./smsService";
import { upsertPatientByPhone } from "./patientService";
import { extractPatientFromHistory } from "./patientExtraction";

export type AppointmentRow = {
  id: string;
  patient_id: string;
  doctor_id: string;
  appointment_date: string;
  appointment_time: string;
  reason: string | null;
  created_at: string;
};

export type PatientInput = {
  first_name: string;
  last_name: string;
  dob: string;
  phone: string;
  email: string;
};

export type BookAppointmentInput = {
  doctor_id?: string;
  /** If set without doctor_id, we resolve doctor by name (voice tools). */
  doctor_name?: string;
  appointment_date: string;
  appointment_time: string;
  reason?: string;
  send_sms_reminder?: boolean;
  session_id?: string;
  patient_id?: string;
  patient?: PatientInput;
};

export type BookAppointmentSuccess = {
  ok: true;
  appointment: AppointmentRow;
  smsPrompt: string;
  doctor_name: string;
};

export type BookAppointmentFailure = {
  ok: false;
  error: string;
  httpStatus: number;
};

export async function bookAppointment(
  input: BookAppointmentInput
): Promise<BookAppointmentSuccess | BookAppointmentFailure> {
  let doctor_id = input.doctor_id?.trim() || "";

  if (!doctor_id && input.doctor_name?.trim()) {
    const byName = await query<{ id: string }>(
      `select id from doctors
       where lower(trim(name)) = lower(trim($1))
       limit 1`,
      [input.doctor_name.trim()]
    );
    if (!byName.rows[0]) {
      const fuzzy = await query<{ id: string }>(
        `select id from doctors
         where lower(name) like lower($1)
         limit 1`,
        [`%${input.doctor_name.trim()}%`]
      );
      doctor_id = fuzzy.rows[0]?.id ?? "";
    } else {
      doctor_id = byName.rows[0].id;
    }
  }

  if (!doctor_id) {
    return { ok: false, error: "Doctor not found. Use a valid doctor_id or doctor_name.", httpStatus: 404 };
  }

  const doctorResult = await query<{
    id: string;
    name: string;
    specialty: string;
    body_part: string;
  }>(`select id, name, specialty, body_part from doctors where id = $1`, [doctor_id]);

  if (!doctorResult.rows[0]) {
    return { ok: false, error: "Doctor not found", httpStatus: 404 };
  }

  const doctor = doctorResult.rows[0];

  let finalPatientId = input.patient_id ?? null;
  let finalPatientEmail: string | null = null;
  let finalPatientPhone: string | null = null;
  let finalPatientFirstName: string | null = null;
  let finalPatientLastName: string | null = null;

  if (!finalPatientId && input.patient) {
    const patientRow = await upsertPatientByPhone(input.patient);
    finalPatientId = patientRow.id;
    finalPatientEmail = patientRow.email;
    finalPatientPhone = patientRow.phone;
    finalPatientFirstName = patientRow.first_name;
    finalPatientLastName = patientRow.last_name;
  } else if (!finalPatientId && !input.patient && input.session_id) {
    const session = await query<{
      conversation_history: Array<{ role: "user" | "assistant"; content: string }>;
    }>(`select conversation_history from chat_sessions where session_id = $1`, [input.session_id]);

    const history = session.rows[0]?.conversation_history ?? [];
    const extracted = extractPatientFromHistory(
      history as Array<{ role: "user" | "assistant"; content: string }>
    );

    if (
      !extracted.first_name ||
      !extracted.last_name ||
      !extracted.dob ||
      !extracted.phone ||
      !extracted.email
    ) {
      return {
        ok: false,
        error:
          "Missing patient details. Complete name, date of birth, phone, and email in chat before booking by phone.",
        httpStatus: 400,
      };
    }

    const patientRow = await upsertPatientByPhone(extracted);
    finalPatientId = patientRow.id;
    finalPatientEmail = patientRow.email;
    finalPatientPhone = patientRow.phone;
    finalPatientFirstName = patientRow.first_name;
    finalPatientLastName = patientRow.last_name;
  } else if (finalPatientId) {
    const patientResult = await query<{
      id: string;
      first_name: string;
      last_name: string;
      phone: string;
      email: string;
    }>(
      `select id, first_name, last_name, phone, email from patients where id = $1`,
      [finalPatientId]
    );

    if (!patientResult.rows[0]) {
      return { ok: false, error: "Patient not found", httpStatus: 404 };
    }

    finalPatientEmail = patientResult.rows[0].email;
    finalPatientPhone = patientResult.rows[0].phone;
    finalPatientFirstName = patientResult.rows[0].first_name;
    finalPatientLastName = patientResult.rows[0].last_name;
  }

  if (!finalPatientId) {
    return { ok: false, error: "Missing patient", httpStatus: 400 };
  }

  const apptResult = await query<{ id: string }>(
    `select id from appointments
     where doctor_id = $1
       and appointment_date::date = $2::date
       and to_char(appointment_time, 'HH24:MI') = $3
     limit 1`,
    [doctor_id, input.appointment_date, input.appointment_time]
  );

  if (apptResult.rows[0]) {
    return {
      ok: false,
      error: "That slot is already booked. Please choose another available slot.",
      httpStatus: 409,
    };
  }

  const insertResult = await query<AppointmentRow>(
    `insert into appointments (patient_id, doctor_id, appointment_date, appointment_time, reason)
     values ($1, $2, $3, $4, $5)
     returning *`,
    [finalPatientId, doctor_id, input.appointment_date, input.appointment_time, input.reason ?? null]
  );

  const appointment = insertResult.rows[0];

  const patientName = [finalPatientFirstName, finalPatientLastName].filter(Boolean).join(" ");

  if (finalPatientEmail) {
    await sendAppointmentEmail({
      toEmail: finalPatientEmail,
      toName: patientName,
      doctorName: doctor.name,
      appointmentDate: input.appointment_date,
      appointmentTime: input.appointment_time,
    });
  }

  if (input.send_sms_reminder && finalPatientPhone) {
    await query(`update patients set sms_reminders_opt_in = true where id = $1`, [
      finalPatientId,
    ]).catch(() => null);

    await sendAppointmentSms({
      toPhone: finalPatientPhone,
      doctorName: doctor.name,
      appointmentDate: input.appointment_date,
      appointmentTime: input.appointment_time,
    });
  }

  const smsPrompt =
    `Your appointment is confirmed with ${doctor.name} on ${input.appointment_date} at ${input.appointment_time}. ` +
    "Would you like SMS reminder notifications as well? (yes/no)";

  if (input.session_id) {
    await query(`update chat_sessions set patient_id = $1 where session_id = $2`, [
      finalPatientId,
      input.session_id,
    ]);

    const session = await query<{
      conversation_history: Array<{ role: "user" | "assistant"; content: string }>;
    }>(`select conversation_history from chat_sessions where session_id = $1`, [input.session_id]);

    const history = Array.isArray(session.rows[0]?.conversation_history)
      ? session.rows[0].conversation_history
      : [];

    const nextHistory = [...history, { role: "assistant" as const, content: smsPrompt }];

    await query(`update chat_sessions set conversation_history = $1::jsonb where session_id = $2`, [
      JSON.stringify(nextHistory),
      input.session_id,
    ]);
  }

  return {
    ok: true,
    appointment,
    smsPrompt,
    doctor_name: doctor.name,
  };
}

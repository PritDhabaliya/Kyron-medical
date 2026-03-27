import type { Request, Response } from "express";
import { z } from "zod";
import { bookAppointment } from "../services/appointmentBookingService";

const PatientInputSchema = z.object({
  first_name: z.string().min(1),
  last_name: z.string().min(1),
  dob: z.string().min(4), // YYYY-MM-DD
  phone: z.string().min(5),
  email: z.string().email(),
});

const AppointmentSchema = z
  .object({
    patient_id: z.coerce.string().optional(),
    patient: PatientInputSchema.optional(),
    doctor_id: z.coerce.string().min(1),
    appointment_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    appointment_time: z.string().regex(/^\d{2}:\d{2}$/),
    reason: z.string().optional(),
    send_sms_reminder: z.boolean().optional(),
    session_id: z.string().optional(),
  })
  .refine(
    (data) => Boolean(data.patient_id) || Boolean(data.patient) || Boolean(data.session_id),
    { message: "Provide either patient_id, patient, or session_id" }
  );

export async function appointmentController(req: Request, res: Response) {
  const parse = AppointmentSchema.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ error: parse.error.flatten() });
    return;
  }

  const {
    patient_id,
    patient,
    doctor_id,
    appointment_date,
    appointment_time,
    reason,
    send_sms_reminder,
    session_id,
  } = parse.data;

  const booked = await bookAppointment({
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


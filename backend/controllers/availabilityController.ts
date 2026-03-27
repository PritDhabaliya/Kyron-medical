import type { Request, Response } from "express";
import { query } from "../models/db";
import { generateSlotsForDoctor } from "../services/availabilityService";

function getDoctorId(req: Request): string | null {
  const raw = (req.query.doctor_id ?? req.query.doctorId) as string | undefined;
  return raw ?? null;
}

export async function availabilityController(req: Request, res: Response) {
  const doctorId = getDoctorId(req);
  if (!doctorId) {
    res.status(400).json({ error: "Missing required query param: doctor_id" });
    return;
  }

  const doctor = await query<{
    id: string;
    name: string;
    specialty: string;
    body_part: string;
  }>(`select id, name, specialty, body_part from doctors where id = $1`, [doctorId]);

  if (!doctor.rows[0]) {
    res.status(404).json({ error: "Doctor not found" });
    return;
  }

  const slots = generateSlotsForDoctor({
    doctorName: doctor.rows[0].name,
    daysAhead: 45,
  });

  res.json({
    doctor: doctor.rows[0],
    slots,
  });
}


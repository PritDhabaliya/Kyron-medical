import type { Request, Response } from "express";
import { z } from "zod";
import { upsertPatientByPhone } from "../services/patientService";

const PatientSchema = z.object({
  first_name: z.string().min(1),
  last_name: z.string().min(1),
  dob: z.string().min(4), // YYYY-MM-DD
  phone: z.string().min(5),
  email: z.string().email(),
});

export async function patientController(req: Request, res: Response) {
  const parse = PatientSchema.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ error: parse.error.flatten() });
    return;
  }

  const patient = await upsertPatientByPhone(parse.data);
  res.json({ patient });
}


import type { Request, Response } from "express";
import { query } from "../models/db";

const fallbackDoctors = [
  { id: "00000000-0000-0000-0000-000000000001", name: "Dr Smith", specialty: "Cardiology", body_part: "heart" },
  { id: "00000000-0000-0000-0000-000000000002", name: "Dr Patel", specialty: "Dermatology", body_part: "skin" },
  { id: "00000000-0000-0000-0000-000000000003", name: "Dr Lee", specialty: "Orthopedics", body_part: "bones" },
  { id: "00000000-0000-0000-0000-000000000004", name: "Dr Garcia", specialty: "Neurology", body_part: "brain" },
];

export async function doctorsController(_req: Request, res: Response) {
  const rows = await query<{
    id: string;
    name: string;
    specialty: string;
    body_part: string;
  }>(`select id, name, specialty, body_part
     from doctors
     order by name`);

  if (rows.rowCount && rows.rowCount > 0) {
    res.json({ doctors: rows.rows });
    return;
  }

  res.json({ doctors: fallbackDoctors });
}


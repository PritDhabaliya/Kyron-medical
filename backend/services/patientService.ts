import { query } from "../models/db";

type PatientInput = {
  first_name: string;
  last_name: string;
  dob: string;
  phone: string;
  email: string;
};

export async function upsertPatientByPhone(input: PatientInput) {
  const existing = await query<{
    id: string;
    first_name: string;
    last_name: string;
    dob: string;
    phone: string;
    email: string;
    created_at: string;
  }>(`select * from patients where phone = $1 limit 1`, [input.phone]);

  if (existing.rows[0]) {
    const updated = await query<{
      id: string;
      first_name: string;
      last_name: string;
      dob: string;
      phone: string;
      email: string;
      created_at: string;
    }>(
      `update patients
       set first_name = $1,
           last_name = $2,
           dob = $3,
           email = $4
       where id = $5
       returning *`,
      [
        input.first_name,
        input.last_name,
        input.dob,
        input.email,
        existing.rows[0].id,
      ]
    );
    return updated.rows[0];
  }

  const inserted = await query<{
    id: string;
    first_name: string;
    last_name: string;
    dob: string;
    phone: string;
    email: string;
    created_at: string;
  }>(
    `insert into patients (first_name, last_name, dob, phone, email)
     values ($1, $2, $3, $4, $5)
     returning *`,
    [input.first_name, input.last_name, input.dob, input.phone, input.email]
  );

  return inserted.rows[0];
}


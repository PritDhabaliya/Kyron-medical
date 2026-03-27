"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.upsertPatientByPhone = upsertPatientByPhone;
const db_1 = require("../models/db");
async function upsertPatientByPhone(input) {
    const existing = await (0, db_1.query)(`select * from patients where phone = $1 limit 1`, [input.phone]);
    if (existing.rows[0]) {
        const updated = await (0, db_1.query)(`update patients
       set first_name = $1,
           last_name = $2,
           dob = $3,
           email = $4
       where id = $5
       returning *`, [
            input.first_name,
            input.last_name,
            input.dob,
            input.email,
            existing.rows[0].id,
        ]);
        return updated.rows[0];
    }
    const inserted = await (0, db_1.query)(`insert into patients (first_name, last_name, dob, phone, email)
     values ($1, $2, $3, $4, $5)
     returning *`, [input.first_name, input.last_name, input.dob, input.phone, input.email]);
    return inserted.rows[0];
}

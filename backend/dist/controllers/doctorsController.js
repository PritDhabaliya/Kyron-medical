"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.doctorsController = doctorsController;
const db_1 = require("../models/db");
const fallbackDoctors = [
    { id: "00000000-0000-0000-0000-000000000001", name: "Dr Smith", specialty: "Cardiology", body_part: "heart" },
    { id: "00000000-0000-0000-0000-000000000002", name: "Dr Patel", specialty: "Dermatology", body_part: "skin" },
    { id: "00000000-0000-0000-0000-000000000003", name: "Dr Lee", specialty: "Orthopedics", body_part: "bones" },
    { id: "00000000-0000-0000-0000-000000000004", name: "Dr Garcia", specialty: "Neurology", body_part: "brain" },
];
async function doctorsController(_req, res) {
    const rows = await (0, db_1.query)(`select id, name, specialty, body_part
     from doctors
     order by name`);
    if (rows.rowCount && rows.rowCount > 0) {
        res.json({ doctors: rows.rows });
        return;
    }
    res.json({ doctors: fallbackDoctors });
}

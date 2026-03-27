export type Slot = {
  appointment_date: string; // YYYY-MM-DD
  appointment_time: string; // HH:MM (24h)
};

const scheduleByDoctorName: Record<
  string,
  { daysOfWeek: number[]; times: string[] }
> = {
  "Dr Smith": { daysOfWeek: [1, 3], times: ["09:00", "11:00"] }, // Mon, Wed
  "Dr. Smith": { daysOfWeek: [1, 3], times: ["09:00", "11:00"] },
  "Dr Patel": { daysOfWeek: [2, 4], times: ["10:00", "14:00"] }, // Tue, Thu
  "Dr. Patel": { daysOfWeek: [2, 4], times: ["10:00", "14:00"] },
  "Dr Lee": { daysOfWeek: [1, 5], times: ["13:00", "16:00"] }, // Mon, Fri
  "Dr. Lee": { daysOfWeek: [1, 5], times: ["13:00", "16:00"] },
  "Dr Garcia": { daysOfWeek: [3, 5], times: ["09:00", "15:00"] }, // Wed, Fri
  "Dr. Garcia": { daysOfWeek: [3, 5], times: ["09:00", "15:00"] },
};

function formatDateYYYYMMDD(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function generateSlotsForDoctor(params: {
  doctorName: string;
  startDate?: Date;
  daysAhead?: number; // next 30-60 days
}): Slot[] {
  const { doctorName, startDate = new Date(), daysAhead = 45 } = params;
  const schedule = scheduleByDoctorName[doctorName];
  if (!schedule) return [];

  const slots: Slot[] = [];
  const start = new Date(startDate);
  start.setHours(0, 0, 0, 0);

  const end = new Date(start);
  end.setDate(end.getDate() + daysAhead);

  for (let dt = new Date(start); dt <= end; dt.setDate(dt.getDate() + 1)) {
    const dow = dt.getDay(); // 0 Sun .. 6 Sat
    if (!schedule.daysOfWeek.includes(dow)) continue;

    const dateStr = formatDateYYYYMMDD(dt);
    for (const timeStr of schedule.times) {
      slots.push({ appointment_date: dateStr, appointment_time: timeStr });
    }
  }

  return slots;
}


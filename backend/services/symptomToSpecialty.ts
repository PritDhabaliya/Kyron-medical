export type Specialty = "Cardiology" | "Dermatology" | "Orthopedics" | "Neurology";

const keywordToSpecialty: Array<{ specialty: Specialty; keywords: string[] }> = [
  { specialty: "Orthopedics", keywords: ["knee", "ankle", "bone", "fracture", "orthopedic", "hip", "joint", "shoulder", "elbow"] },
  { specialty: "Dermatology", keywords: ["rash", "skin", "itch", "eczema", "psoriasis", "dermatology", "hives"] },
  { specialty: "Cardiology", keywords: ["chest pain", "chest", "heart", "palpitations", "cardio", "shortness of breath"] },
  { specialty: "Neurology", keywords: ["headache", "migraine", "neurology", "numbness", "tingling", "seizure", "dizziness"] },
];

export function inferSpecialtyFromMessage(message: string): Specialty | null {
  const lower = message.toLowerCase();
  for (const item of keywordToSpecialty) {
    if (item.keywords.some((k) => lower.includes(k))) return item.specialty;
  }
  return null;
}

export function normalizeSpecialty(value: string | null | undefined): Specialty | null {
  if (!value) return null;
  const lower = value.toLowerCase();
  if (lower.includes("ortho")) return "Orthopedics";
  if (lower.includes("derm") || lower.includes("skin")) return "Dermatology";
  if (lower.includes("cardio") || lower.includes("heart")) return "Cardiology";
  if (lower.includes("neuro") || lower.includes("brain") || lower.includes("head")) {
    return "Neurology";
  }
  return null;
}


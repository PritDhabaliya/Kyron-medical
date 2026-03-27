export type ExtractedPatient = {
  first_name: string;
  last_name: string;
  dob: string;
  phone: string;
  email: string;
};

export function normalizePhone(raw: string) {
  const digits = raw.replace(/\D/g, "");
  if (!digits) return raw;
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  if (raw.startsWith("+")) return raw;
  return `+${digits}`;
}

export function parseDateToIso(value: string): string | null {
  const trimmed = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  // YYYY/MM/DD
  const ymd = trimmed.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
  if (ymd) {
    const yyyy = ymd[1];
    const mm = ymd[2].padStart(2, "0");
    const dd = ymd[3].padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }
  // MM/DD/YYYY
  const mdy = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!mdy) return null;
  const mm = mdy[1].padStart(2, "0");
  const dd = mdy[2].padStart(2, "0");
  const yyyy = mdy[3];
  return `${yyyy}-${mm}-${dd}`;
}

type Msg = { role: "user" | "assistant"; content: string };

export function extractPatientFromHistory(
  history: Msg[]
): ExtractedPatient {
  const allUser = history
    .filter((m) => m.role === "user")
    .map((m) => m.content)
    .join("\n");

  const firstName =
    allUser.match(/\b(?:i am|i'm|my name is)\s+([a-zA-Z]+)\b/i)?.[1] ?? "";
  const twoWordNameMatch = allUser.match(
    /\b(?:i am|i'm|my name is)\s+([a-zA-Z]+)\s+([a-zA-Z]+)\b/i
  );

  let email =
    allUser.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi)?.[0] ?? "";

  const phoneRaw =
    allUser.match(/(?:\+?\d[\d\s\-()]{8,}\d)/)?.[0] ?? "";
  let phone = phoneRaw ? normalizePhone(phoneRaw) : "";

  let lastName = "";
  let dob = "";

  // Handles "Dhabaliya,01/15/2001,9303334103,email@..." pattern
  const commaLine = allUser
    .split("\n")
    .find((line) => line.split(",").length >= 4 && /@/.test(line));
  if (commaLine) {
    const parts = commaLine.split(",").map((x) => x.trim());
    lastName = parts[0] ?? "";
    dob = parseDateToIso(parts[1] ?? "") ?? "";
    if (parts[2]) phone = normalizePhone(parts[2]);
    if (parts[3] && /@/.test(parts[3])) email = parts[3];
  }

  if (!dob) {
    const ymd = allUser.match(/\b\d{4}-\d{2}-\d{2}\b/)?.[0];
    // YYYY/MM/DD
    const ymdSlash =
      allUser.match(/\b\d{4}\/\d{1,2}\/\d{1,2}\b/)?.[0] ?? "";
    const mdy = allUser.match(/\b\d{1,2}\/\d{1,2}\/\d{4}\b/)?.[0];
    dob =
      ymd ??
      (ymdSlash ? parseDateToIso(ymdSlash) ?? "" : "") ??
      (mdy ? parseDateToIso(mdy) ?? "" : "");
  }

  // Fallback: try to infer first name from email local-part (e.g. prit.dhabaliya@...)
  let inferredFirst = firstName;
  if (!inferredFirst && email) {
    const local = email.split("@")[0] ?? "";
    const token = local.split(/[._-]/).find(Boolean) ?? "";
    inferredFirst = token.replace(/[^a-z]/gi, "").slice(0, 24);
  }

  // Fallback: infer last name from email local-part (e.g. ...prit.dhabaliya@...)
  if (!lastName && email) {
    const local = email.split("@")[0] ?? "";
    const parts = local.split(/[._-]/).filter(Boolean);
    const token = parts.length > 1 ? parts[parts.length - 1] : parts[0] ?? "";
    lastName = token.replace(/[^a-z]/gi, "").slice(0, 24);
  }

  // Fallback: if "I am John Smith" was provided, capture last name from that.
  if ((!lastName || !lastName.trim()) && twoWordNameMatch) {
    lastName = twoWordNameMatch[2] ?? "";
  }

  return {
    first_name: inferredFirst || "Patient",
    last_name: lastName,
    dob: dob,
    phone: phone,
    email: email,
  };
}


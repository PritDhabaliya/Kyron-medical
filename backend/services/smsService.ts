import twilio from "twilio";

function toE164(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (raw.startsWith("+")) return raw;
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return `+${digits}`;
}

export async function sendAppointmentSms(params: {
  toPhone: string;
  doctorName: string;
  appointmentDate: string;
  appointmentTime: string;
}) {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const fromPhone = process.env.TWILIO_PHONE_NUMBER;

  if (!accountSid || !authToken || !fromPhone) {
    throw new Error("Twilio configuration is missing.");
  }

  const client = twilio(accountSid, authToken);
  await client.messages.create({
    from: fromPhone,
    to: toE164(params.toPhone),
    body: `Kyron Medical appointment confirmed: ${params.doctorName} on ${params.appointmentDate} at ${params.appointmentTime}.`,
  });
}


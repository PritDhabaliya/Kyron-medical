import sgMail from "@sendgrid/mail";

export async function sendAppointmentEmail(params: {
  toEmail: string;
  toName: string;
  doctorName: string;
  appointmentDate: string; // YYYY-MM-DD
  appointmentTime: string; // HH:MM
}) {
  const apiKey = process.env.SENDGRID_API_KEY ?? "";
  if (!apiKey.startsWith("SG.")) {
    throw new Error("SendGrid API key is missing or invalid.");
  }
  sgMail.setApiKey(apiKey);

  const clinicAddress = "Kyron Medical Clinic";

  const msg = {
    to: params.toEmail,
    from: process.env.SENDGRID_FROM_EMAIL,
    subject: "Kyron Medical - Appointment Confirmation",
    text: [
      `Hi ${params.toName},`,
      ``,
      `Your appointment is confirmed:`,
      `Doctor: ${params.doctorName}`,
      `Date: ${params.appointmentDate}`,
      `Time: ${params.appointmentTime}`,
      ``,
      `Clinic: ${clinicAddress}`,
    ].join("\n"),
  };

  await sgMail.send(msg as never);
}


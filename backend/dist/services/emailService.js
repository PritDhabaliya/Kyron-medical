"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendAppointmentEmail = sendAppointmentEmail;
const mail_1 = __importDefault(require("@sendgrid/mail"));
async function sendAppointmentEmail(params) {
    const apiKey = process.env.SENDGRID_API_KEY ?? "";
    if (!apiKey.startsWith("SG.")) {
        throw new Error("SendGrid API key is missing or invalid.");
    }
    mail_1.default.setApiKey(apiKey);
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
    await mail_1.default.send(msg);
}

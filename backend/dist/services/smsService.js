"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendAppointmentSms = sendAppointmentSms;
const twilio_1 = __importDefault(require("twilio"));
function toE164(raw) {
    const digits = raw.replace(/\D/g, "");
    if (raw.startsWith("+"))
        return raw;
    if (digits.length === 10)
        return `+1${digits}`;
    if (digits.length === 11 && digits.startsWith("1"))
        return `+${digits}`;
    return `+${digits}`;
}
async function sendAppointmentSms(params) {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const fromPhone = process.env.TWILIO_PHONE_NUMBER;
    if (!accountSid || !authToken || !fromPhone) {
        throw new Error("Twilio configuration is missing.");
    }
    const client = (0, twilio_1.default)(accountSid, authToken);
    await client.messages.create({
        from: fromPhone,
        to: toE164(params.toPhone),
        body: `Kyron Medical appointment confirmed: ${params.doctorName} on ${params.appointmentDate} at ${params.appointmentTime}.`,
    });
}

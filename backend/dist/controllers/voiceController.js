"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.voiceController = voiceController;
const zod_1 = require("zod");
const db_1 = require("../models/db");
const symptomToSpecialty_1 = require("../services/symptomToSpecialty");
const VoiceCallSchema = zod_1.z.object({
    phone_number: zod_1.z.string().min(5),
    session_id: zod_1.z.string().min(1),
});
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
async function voiceController(req, res) {
    const parse = VoiceCallSchema.safeParse(req.body);
    if (!parse.success) {
        res.status(400).json({ error: parse.error.flatten() });
        return;
    }
    const { phone_number, session_id } = parse.data;
    let session = await (0, db_1.query)(`select cs.patient_id,
            cs.conversation_history,
            p.first_name,
            p.last_name,
            cs.session_id
     from chat_sessions cs
     left join patients p on p.id = cs.patient_id
     where cs.session_id = $1`, [session_id]);
    let row = session.rows[0];
    if (!row) {
        // Create an empty session so the call can still start at any point.
        await (0, db_1.query)(`insert into chat_sessions (session_id, conversation_history)
       values ($1, '[]'::jsonb)
       on conflict (session_id) do nothing`, [session_id]);
        session = await (0, db_1.query)(`select cs.patient_id,
              cs.conversation_history,
              p.first_name,
              p.last_name,
              cs.session_id
       from chat_sessions cs
       left join patients p on p.id = cs.patient_id
       where cs.session_id = $1`, [session_id]);
        row = session.rows[0];
    }
    const conversation = row?.conversation_history ?? [];
    const allUserText = conversation
        .filter((m) => m.role === "user")
        .map((m) => m.content)
        .join("\n");
    const specialty = (0, symptomToSpecialty_1.inferSpecialtyFromMessage)(allUserText) ?? "your";
    const patientName = [row?.first_name, row?.last_name]
        .filter(Boolean)
        .join(" ") || "there";
    const greeting = `Hi ${patientName}, we were scheduling your ${specialty} appointment. Let's continue.`;
    const vapiApiKey = process.env.VOICE_AI_API_KEY;
    const vapiAssistantId = process.env.VAPI_ASSISTANT_ID;
    const vapiPhoneNumberId = process.env.VAPI_PHONE_NUMBER_ID;
    if (!vapiApiKey || !vapiAssistantId || !vapiPhoneNumberId) {
        res.status(500).json({
            error: "Missing Vapi configuration. Ensure VOICE_AI_API_KEY, VAPI_ASSISTANT_ID, VAPI_PHONE_NUMBER_ID are set.",
        });
        return;
    }
    // Provide conversation context as proper message roles so Vapi/OpenAI continues reliably.
    const systemPrompt = "You are Kyron Medical's appointment scheduling phone assistant. " +
        "You ONLY help schedule appointments (no prescriptions, no clinic info). " +
        "Use the conversation history to continue exactly where the patient left off. " +
        "If patient details are missing, ask for them. If a slot is available, confirm date/time. " +
        "After booking, ask: \"Would you like SMS reminder notifications as well? (yes/no)\".";
    const vapiMessages = [
        { role: "system", content: systemPrompt },
        ...conversation.map((m) => ({
            role: m.role,
            content: m.content,
        })),
    ];
    const payload = {
        assistantId: vapiAssistantId,
        phoneNumberId: vapiPhoneNumberId,
        customer: { number: toE164(phone_number) },
        assistantOverrides: {
            firstMessage: greeting,
            model: {
                provider: "openai",
                model: process.env.OPENAI_MODEL ?? "gpt-4o",
                messages: vapiMessages,
            },
        },
    };
    // Try /call/phone first (official outbound phone route), then fallback to /call.
    let response = await fetch("https://api.vapi.ai/call/phone", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${vapiApiKey}`,
        },
        body: JSON.stringify(payload),
    });
    if (!response.ok) {
        response = await fetch("https://api.vapi.ai/call", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${vapiApiKey}`,
            },
            body: JSON.stringify(payload),
        });
    }
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
        res.status(response.status).json({ error: body });
        return;
    }
    res.json({ call: body });
}

import type { Request, Response } from "express";
import { z } from "zod";
import { query } from "../models/db";
import { inferSpecialtyFromMessage } from "../services/symptomToSpecialty";

const VoiceCallSchema = z.object({
  phone_number: z.string().min(5),
  session_id: z.string().min(1),
});

function toE164(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (raw.startsWith("+")) return raw;
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return `+${digits}`;
}

export async function voiceController(req: Request, res: Response) {
  const parse = VoiceCallSchema.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ error: parse.error.flatten() });
    return;
  }

  const { phone_number, session_id } = parse.data;

  let session = await query<{
    patient_id: string | null;
    conversation_history: Array<{ role: "user" | "assistant"; content: string }>;
    first_name: string | null;
    last_name: string | null;
    session_id: string;
  }>(
    `select cs.patient_id,
            cs.conversation_history,
            p.first_name,
            p.last_name,
            cs.session_id
     from chat_sessions cs
     left join patients p on p.id = cs.patient_id
     where cs.session_id = $1`,
    [session_id]
  );

  let row = session.rows[0];
  if (!row) {
    // Create an empty session so the call can still start at any point.
    await query(
      `insert into chat_sessions (session_id, conversation_history)
       values ($1, '[]'::jsonb)
       on conflict (session_id) do nothing`,
      [session_id]
    );
    session = await query<{
      patient_id: string | null;
      conversation_history: Array<{ role: "user" | "assistant"; content: string }>;
      first_name: string | null;
      last_name: string | null;
      session_id: string;
    }>(
      `select cs.patient_id,
              cs.conversation_history,
              p.first_name,
              p.last_name,
              cs.session_id
       from chat_sessions cs
       left join patients p on p.id = cs.patient_id
       where cs.session_id = $1`,
      [session_id]
    );
    row = session.rows[0];
  }

  const conversation = row?.conversation_history ?? [];
  const allUserText = conversation
    .filter((m) => m.role === "user")
    .map((m) => m.content)
    .join("\n");

  const specialty = inferSpecialtyFromMessage(allUserText) ?? "your";
  const patientName = [row?.first_name, row?.last_name]
    .filter(Boolean)
    .join(" ") || "there";

  const greeting = `Hi ${patientName}, we were scheduling your ${specialty} appointment. Let's continue.`;

  const vapiApiKey = process.env.VOICE_AI_API_KEY;
  const vapiAssistantId = process.env.VAPI_ASSISTANT_ID;
  const vapiPhoneNumberId = process.env.VAPI_PHONE_NUMBER_ID;

  if (!vapiApiKey || !vapiAssistantId || !vapiPhoneNumberId) {
    res.status(500).json({
      error:
        "Missing Vapi configuration. Ensure VOICE_AI_API_KEY, VAPI_ASSISTANT_ID, VAPI_PHONE_NUMBER_ID are set.",
    });
    return;
  }

  // Provide conversation context as proper message roles so Vapi/OpenAI continues reliably.
  const systemPrompt =
    "You are Kyron Medical's appointment scheduling phone assistant. " +
    "You ONLY help schedule appointments (no prescriptions, no clinic info). " +
    "Use the conversation history to continue exactly where the patient left off. " +
    "If patient details are missing, ask for them. If a slot is available, confirm date/time. " +
    "After booking, ask: \"Would you like SMS reminder notifications as well? (yes/no)\".";

  const vapiMessages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
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


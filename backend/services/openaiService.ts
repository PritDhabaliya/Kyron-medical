import OpenAI from "openai";

export type ChatAssistantOutput = {
  action:
    | "request_patient_info"
    | "offer_slots"
    | "book_appointment"
    | "unknown";
  reply: string;
  extracted?: {
    first_name?: string;
    last_name?: string;
    dob?: string; // YYYY-MM-DD
    phone?: string;
    email?: string;
    reason?: string;
    specialty?: "Cardiology" | "Dermatology" | "Orthopedics" | "Neurology";
    appointment_date?: string; // YYYY-MM-DD
    appointment_time?: string; // HH:MM
  };
};

function safeExtractJsonObject(text: string): unknown {
  const firstBrace = text.indexOf("{");
  const lastBrace = text.lastIndexOf("}");
  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) return null;
  const jsonText = text.slice(firstBrace, lastBrace + 1);
  return JSON.parse(jsonText);
}

export async function generateChatAssistantOutput(params: {
  userMessage: string;
  conversationHistory: Array<{ role: "user" | "assistant"; content: string }>;
}): Promise<ChatAssistantOutput> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return {
      action: "unknown",
      reply:
        "AI scheduling is temporarily unavailable because OPENAI_API_KEY is missing.",
    };
  }

  const openai = new OpenAI({ apiKey });

  const system = [
    "You are Kyron Medical's appointment scheduling assistant.",
    "You ONLY handle appointment scheduling (no prescriptions, no clinic info).",
    "You must respond with a JSON object only (no markdown).",
    "JSON schema:",
    "{ action: 'request_patient_info'|'offer_slots'|'book_appointment'|'unknown', reply: string, extracted?: { first_name,last_name,dob,phone,email,reason,specialty,appointment_date,appointment_time } }",
    "Rules:",
    "- If the user shares symptoms, infer the specialty and put it in extracted.specialty.",
    "- If the user shares patient details, put them in extracted fields.",
    "- If the user explicitly asks to book and provides a date/time, set action='book_appointment' and fill appointment_date/appointment_time.",
    "- If you need more info, set action='request_patient_info' and ask clearly for missing fields.",
    "- Keep reply short and friendly.",
  ].join("\n");

  const messages = [
    { role: "system" as const, content: system },
    ...params.conversationHistory.map((m) => ({ role: m.role, content: m.content })),
    { role: "user" as const, content: params.userMessage },
  ];

  const completion = await openai.chat.completions.create({
    model: process.env.OPENAI_MODEL ?? "gpt-4o",
    messages,
    temperature: 0.2,
  });

  const text = completion.choices?.[0]?.message?.content ?? "";
  const parsed = safeExtractJsonObject(text) as Partial<ChatAssistantOutput> | null;

  if (!parsed || typeof parsed !== "object") {
    return {
      action: "unknown",
      reply: "I’m here to help schedule your appointment. Could you share your symptoms and your preferred date/time?",
    };
  }

  return {
    action: parsed.action ?? "unknown",
    reply: typeof parsed.reply === "string" ? parsed.reply : "Let’s schedule your appointment.",
    extracted: parsed.extracted,
  };
}


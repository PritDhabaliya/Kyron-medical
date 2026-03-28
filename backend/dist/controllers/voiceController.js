/**
 * Voice AI Controller (Vapi)
 *
 * - Reads conversation from chat_sessions by session_id
 * - Builds a short context summary + greeting
 * - Starts an outbound call via Vapi so voice can continue naturally
 *
 * Safety: never give medical advice (scheduling only).
 */

const { Pool } = require("pg");

let pool = null;
function getPool() {
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
    });
  }
  return pool;
}

function toE164(raw) {
  const s = String(raw || "").trim();
  const digits = s.replace(/\D/g, "");
  if (s.startsWith("+")) return s;
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return digits ? `+${digits}` : s;
}

function inferSpecialtyFromText(text) {
  const lower = String(text || "").toLowerCase();
  if (/(rash|skin|itch|eczema|psoriasis|hives)/.test(lower)) return "dermatology";
  if (/(knee|ankle|bone|fracture|hip|joint|shoulder|elbow|orthopedic)/.test(lower))
    return "orthopedics";
  if (/(chest|heart|palpitations|shortness of breath)/.test(lower)) return "cardiology";
  if (/(headache|migraine|numbness|tingling|seizure|dizziness)/.test(lower))
    return "neurology";
  return null;
}

function buildConversationSummary(history) {
  if (!Array.isArray(history) || history.length === 0) return null;

  const userText = history
    .filter((m) => m && m.role === "user" && typeof m.content === "string")
    .map((m) => m.content)
    .join("\n");

  const specialty = inferSpecialtyFromText(userText);

  // Keep it short and high-level (no medical advice).
  const lines = ["Patient was chatting with the Kyron Medical assistant."];
  if (specialty) lines.push(`Conversation relates to scheduling a ${specialty} appointment.`);
  else lines.push("Conversation relates to scheduling a medical appointment.");
  lines.push("Assistant should continue scheduling based on what was discussed.");

  return { specialty, summaryText: lines.join(" ") };
}

function greetingForHistory(summary) {
  const safety =
    "I cannot provide medical advice, but I can help schedule an appointment with a doctor.";

  if (!summary) {
    return (
      "Hello, this is the Kyron Medical AI assistant. I can help you schedule an appointment. " +
      safety +
      " How can I help today?"
    );
  }

  const specialtyPhrase = summary.specialty
    ? `${summary.specialty} appointment`
    : "appointment";

  return (
    `Hi, we were discussing scheduling your ${specialtyPhrase}. Let's continue. ` +
    safety
  );
}

/**
 * Vapi POST /call: use assistantOverrides.firstMessage only.
 * assistantOverrides.model (nested OpenAI messages) is often rejected by Vapi and
 * returns HTTP 400 (surfaced as 502 from this server).
 *
 * Optional: define matching {{variables}} on your Vapi assistant and set
 * VAPI_VOICE_VARIABLES=1 to send variableValues (chat_summary, recent_chat).
 */
function extractVapiErrorMessage(data) {
  if (!data || typeof data !== "object") return null;
  if (typeof data.message === "string") return data.message;
  if (Array.isArray(data.message)) {
    const parts = data.message.map((item) => {
      if (typeof item === "string") return item;
      if (item && typeof item === "object" && "message" in item) {
        return String((item).message);
      }
      return JSON.stringify(item);
    });
    return parts.filter(Boolean).join("; ");
  }
  if (typeof data.error === "string") return data.error;
  if (data.error && typeof data.error === "object" && data.error.message) {
    return String(data.error.message);
  }
  return null;
}

async function readConversationHistory(sessionId) {
  const sql =
    "select conversation_history from chat_sessions where session_id = $1 limit 1";
  const result = await getPool().query(sql, [sessionId]);
  return result.rows[0]?.conversation_history ?? null;
}

/**
 * POST /api/voice/call
 * Body: { phone_number, session_id }
 */
async function voiceController(req, res) {
  try {
    const phone_number = req.body?.phone_number;
    const session_id = req.body?.session_id;

    if (!phone_number) {
      return res.status(400).json({ error: "missing phone_number" });
    }
    if (!session_id) {
      return res.status(400).json({ error: "missing session_id" });
    }

    const apiKey = process.env.VOICE_AI_API_KEY;
    const assistantId = process.env.VAPI_ASSISTANT_ID;
    const phoneNumberId = process.env.VAPI_PHONE_NUMBER_ID;

    if (!apiKey || !assistantId || !phoneNumberId) {
      return res.status(500).json({
        error:
          "Missing Vapi configuration. Ensure VOICE_AI_API_KEY, VAPI_ASSISTANT_ID, VAPI_PHONE_NUMBER_ID are set.",
      });
    }

    let history = null;
    try {
      history = await readConversationHistory(session_id);
    } catch (dbErr) {
      return res.status(500).json({ error: "database error", details: String(dbErr?.message ?? dbErr) });
    }

    const summary = buildConversationSummary(history);
    const greeting_message = greetingForHistory(summary);

    const assistantOverrides = { firstMessage: greeting_message };
    if (process.env.VAPI_VOICE_VARIABLES === "1") {
      const vars = {};
      if (summary?.summaryText) vars.chat_summary = summary.summaryText.slice(0, 2000);
      if (Array.isArray(history) && history.length > 0) {
        const tail = history.slice(-8);
        const lines = [];
        for (const m of tail) {
          if (!m || typeof m.content !== "string") continue;
          if (m.role !== "user" && m.role !== "assistant") continue;
          const label = m.role === "user" ? "Patient" : "Assistant";
          lines.push(`${label}: ${m.content.trim()}`);
        }
        if (lines.length) vars.recent_chat = lines.join("\n").slice(0, 3500);
      }
      if (Object.keys(vars).length) assistantOverrides.variableValues = vars;
    }

    const payload = {
      assistantId,
      phoneNumberId,
      customer: { number: toE164(phone_number) },
      metadata: { session_id },
      assistantOverrides,
    };

    const response = await fetch("https://api.vapi.ai/call", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const vapiMsg = extractVapiErrorMessage(data);
      const message =
        vapiMsg ||
        `Vapi rejected the call (HTTP ${response.status}). Check API key, assistant/phone IDs, and that the destination number is allowed on your Vapi/Twilio plan.`;
      return res.status(502).json({
        error: "failed vapi api call",
        message,
        vapi_status: response.status,
        vapi_body: data,
      });
    }

    return res.json({ call: data, greeting_message, summary });
  } catch (err) {
    return res.status(500).json({ error: "unexpected error", details: String(err?.message ?? err) });
  }
}

module.exports = { voiceController };


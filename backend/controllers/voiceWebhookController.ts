import type { Request, Response } from "express";
import { bookAppointment } from "../services/appointmentBookingService";

/**
 * Vapi Server URL — handles `tool-calls` so voice can persist appointments.
 * @see https://docs.vapi.ai/server-url/events
 *
 * Configure in Vapi: Assistant → Server URL → https://YOUR_HOST/api/voice/webhook
 * Add function `book_kyron_appointment` to the assistant model (see config/vapi-book-appointment-tool.json).
 */
export async function voiceWebhookController(req: Request, res: Response) {
  try {
    const body = req.body as {
      message?: {
        type?: string;
        call?: { metadata?: { session_id?: string } };
        toolCallList?: Array<{
          id?: string;
          name?: string;
          parameters?: Record<string, unknown>;
        }>;
        toolWithToolCallList?: Array<{
          name?: string;
          toolCall?: { id?: string; parameters?: Record<string, unknown> };
        }>;
      };
    };

    const msg = body?.message;
    if (!msg || msg.type !== "tool-calls") {
      res.status(200).json({ ok: true });
      return;
    }

    const callMeta = msg.call?.metadata;
    const sessionFromCall =
      typeof callMeta?.session_id === "string" ? callMeta.session_id : undefined;

    const list = normalizeToolCalls(msg);

    const results: Array<{
      name: string;
      toolCallId: string;
      result: string;
    }> = [];

    for (const tc of list) {
      const toolCallId = String(tc.id ?? "");
      const name = String(tc.name ?? "");
      const parameters = tc.parameters ?? {};

      if (name !== "book_kyron_appointment") {
        results.push({
          name,
          toolCallId,
          result: JSON.stringify({ success: false, error: `Unknown tool: ${name}` }),
        });
        continue;
      }

      const appointment_date = String(parameters.appointment_date ?? "").trim();
      let appointment_time = String(parameters.appointment_time ?? "").trim();
      appointment_time = normalizeTimeToHHMM(appointment_time);

      const doctor_id = parameters.doctor_id != null ? String(parameters.doctor_id).trim() : undefined;
      const doctor_name =
        parameters.doctor_name != null ? String(parameters.doctor_name).trim() : undefined;

      const session_id =
        (parameters.session_id != null ? String(parameters.session_id).trim() : undefined) ||
        sessionFromCall;

      const send_sms_reminder = parameters.send_sms_reminder === true;

      if (!/^\d{4}-\d{2}-\d{2}$/.test(appointment_date)) {
        results.push({
          name,
          toolCallId,
          result: JSON.stringify({
            success: false,
            error: "appointment_date must be YYYY-MM-DD",
          }),
        });
        continue;
      }

      if (!/^\d{2}:\d{2}$/.test(appointment_time)) {
        results.push({
          name,
          toolCallId,
          result: JSON.stringify({
            success: false,
            error: "appointment_time must be HH:MM (24h), e.g. 14:30",
          }),
        });
        continue;
      }

      if (!doctor_id && !doctor_name) {
        results.push({
          name,
          toolCallId,
          result: JSON.stringify({
            success: false,
            error: "Provide doctor_id (UUID) or doctor_name (e.g. Dr Smith)",
          }),
        });
        continue;
      }

      const booked = await bookAppointment({
        doctor_id,
        doctor_name,
        appointment_date,
        appointment_time,
        session_id,
        send_sms_reminder,
        reason:
          parameters.reason != null ? String(parameters.reason).slice(0, 500) : undefined,
      });

      if (booked.ok) {
        results.push({
          name,
          toolCallId,
          result: JSON.stringify({
            success: true,
            appointment_id: booked.appointment.id,
            doctor: booked.doctor_name,
            message: `Booked with ${booked.doctor_name} on ${appointment_date} at ${appointment_time}.`,
          }),
        });
      } else {
        results.push({
          name,
          toolCallId,
          result: JSON.stringify({ success: false, error: booked.error }),
        });
      }
    }

    res.status(200).json({ results });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("voiceWebhookController:", e);
    res.status(500).json({ error: "webhook handler failed" });
  }
}

function normalizeToolCalls(message: {
  toolCallList?: Array<{ id?: string; name?: string; parameters?: Record<string, unknown> }>;
  toolWithToolCallList?: Array<{
    name?: string;
    toolCall?: { id?: string; parameters?: Record<string, unknown> };
  }>;
}): Array<{ id: string; name: string; parameters: Record<string, unknown> }> {
  if (Array.isArray(message.toolCallList) && message.toolCallList.length > 0) {
    return message.toolCallList.map((tc) => ({
      id: String(tc.id ?? ""),
      name: String(tc.name ?? ""),
      parameters: tc.parameters ?? {},
    }));
  }
  if (Array.isArray(message.toolWithToolCallList)) {
    return message.toolWithToolCallList.map((row) => ({
      id: String(row.toolCall?.id ?? ""),
      name: String(row.name ?? ""),
      parameters: row.toolCall?.parameters ?? {},
    }));
  }
  return [];
}

/** Best-effort: "14:30", "2:30 PM" not fully parsed — prefer HH:MM from tool. */
function normalizeTimeToHHMM(t: string): string {
  const m = t.match(/^(\d{1,2}):(\d{2})$/);
  if (m) {
    const h = Number(m[1]);
    const min = m[2];
    if (h >= 0 && h <= 23) return `${String(h).padStart(2, "0")}:${min}`;
  }
  return t;
}

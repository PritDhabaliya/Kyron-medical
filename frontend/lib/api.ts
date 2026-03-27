const API_BASE = process.env.NEXT_PUBLIC_API_URL;

export type Slot = { appointment_date: string; appointment_time: string };
export type Doctor = {
  id: string | number;
  name: string;
  specialty: string;
  body_part: string;
};

export type AppointmentOptions = { doctor: Doctor; slots: Slot[] };

export type Appointment = {
  id: string;
  patient_id: string;
  doctor_id: string;
  appointment_date: string;
  appointment_time: string;
  reason: string | null;
  created_at: string;
};

export type ChatResponse = {
  reply: string;
  session_id: string;
  appointmentOptions?: AppointmentOptions;
  booked?: { appointment: Appointment; doctor_name?: string };
};

export type AppointmentRequest = {
  doctor_id: string | number;
  appointment_date: string;
  appointment_time: string;
  reason?: string;
  send_sms_reminder?: boolean;
  session_id?: string;
  patient?: {
    first_name: string;
    last_name: string;
    dob: string;
    phone: string;
    email: string;
  };
};

export type VoiceCallResponse = {
  call?: unknown;
};

async function request<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const data: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const o = data as {
      message?: unknown;
      error?: unknown;
    } | null;
    const nestedError =
      o?.error &&
      typeof o.error === "object" &&
      "message" in o.error
        ? (o.error as { message?: unknown }).message
        : null;
    const message =
      typeof o?.message === "string"
        ? o.message
        : typeof o?.error === "string"
          ? o.error
          : typeof nestedError === "string"
            ? nestedError
            : `Request failed: ${res.status}`;
    throw new Error(message);
  }
  return data as T;
}

export async function postChat(input: {
  user_message: string;
  session_id: string;
}) {
  return request<ChatResponse>("/api/chat", input);
}

export async function postAppointment(input: AppointmentRequest) {
  return request<{
    appointment: Appointment;
    smsPrompt?: string;
    doctor_name?: string;
  }>(`/api/appointment`, input);
}

export async function postVoiceCall(input: {
  phone_number: string;
  session_id: string;
}) {
  const res = await fetch(`${API_BASE}/api/voice/call`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const data: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const o = data as {
      message?: unknown;
      error?: unknown;
      vapi_body?: unknown;
      vapi_status?: unknown;
    } | null;
    let msg =
      typeof o?.message === "string"
        ? o.message
        : typeof o?.error === "string"
          ? o.error
          : `Request failed: ${res.status}`;
    if (o?.vapi_body != null && typeof o.vapi_body === "object") {
      const detail = JSON.stringify(o.vapi_body).slice(0, 1200);
      if (!msg.includes(detail.slice(0, 80))) {
        msg = `${msg} — ${detail}`;
      }
    }
    throw new Error(msg);
  }
  return data as VoiceCallResponse;
}


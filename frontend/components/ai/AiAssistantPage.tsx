"use client";

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Phone, Send, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { postAppointment, postChat, postVoiceCall } from "@/lib/api";
import type {
  Appointment,
  AppointmentOptions,
  Slot,
} from "@/lib/api";

type ChatMessage = { id: string; role: "user" | "assistant"; content: string };

type Patient = {
  first_name: string;
  last_name: string;
  dob: string;
  phone: string;
  email: string;
};

function normalizePhone(raw: string) {
  const digits = raw.replace(/\D/g, "");
  if (!digits) return raw;
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  if (raw.startsWith("+")) return raw;
  return `+${digits}`;
}

function parseDateToIso(value: string) {
  const trimmed = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  // YYYY/MM/DD
  const ymd = trimmed.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
  if (ymd) {
    const yyyy = ymd[1];
    const mm = ymd[2].padStart(2, "0");
    const dd = ymd[3].padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }
  // MM/DD/YYYY
  const mdy = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!mdy) return "";
  const mm = mdy[1].padStart(2, "0");
  const dd = mdy[2].padStart(2, "0");
  const yyyy = mdy[3];
  return `${yyyy}-${mm}-${dd}`;
}

function extractPatientFromMessages(messages: ChatMessage[]): Patient {
  const allUser = messages
    .filter((m) => m.role === "user")
    .map((m) => m.content)
    .join("\n");

  const firstName =
    allUser.match(/\b(?:i am|i'm|my name is)\s+([a-zA-Z]+)\b/i)?.[1] ?? "";
  const twoWordNameMatch = allUser.match(
    /\b(?:i am|i'm|my name is)\s+([a-zA-Z]+)\s+([a-zA-Z]+)\b/i
  );

  let email =
    allUser.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi)?.[0] ?? "";
  const phoneRaw = allUser.match(/(?:\+?\d[\d\s\-()]{8,}\d)/)?.[0] ?? "";
  let phone = phoneRaw ? normalizePhone(phoneRaw) : "";

  const commaLine = allUser
    .split("\n")
    .find((line) => line.split(",").length >= 4 && /@/.test(line));

  let lastName = "";
  let dob = "";
  if (commaLine) {
    const parts = commaLine.split(",").map((x) => x.trim());
    lastName = parts[0] ?? "";
    dob = parts[1] ? parseDateToIso(parts[1]) : "";
    if (parts[2]) phone = normalizePhone(parts[2]);
    if (parts[3] && /@/.test(parts[3])) email = parts[3];
  }

  if (!dob) {
    const ymd = allUser.match(/\b\d{4}-\d{2}-\d{2}\b/)?.[0] ?? "";
    // YYYY/MM/DD
    const ymdSlash =
      allUser.match(/\b\d{4}\/\d{1,2}\/\d{1,2}\b/)?.[0] ?? "";
    const mdy = allUser.match(/\b\d{1,2}\/\d{1,2}\/\d{4}\b/)?.[0] ?? "";
    dob = ymd || (ymdSlash ? parseDateToIso(ymdSlash) : "") || (mdy ? parseDateToIso(mdy) : "");
  }

  let inferredFirst = firstName;
  if (!inferredFirst && email) {
    const local = email.split("@")[0] ?? "";
    const token = local.split(/[._-]/).find(Boolean) ?? "";
    inferredFirst = token.replace(/[^a-z]/gi, "").slice(0, 24);
  }

  if (!lastName && email) {
    const local = email.split("@")[0] ?? "";
    const parts = local.split(/[._-]/).filter(Boolean);
    const token = parts.length > 1 ? parts[parts.length - 1] : parts[0] ?? "";
    lastName = token.replace(/[^a-z]/gi, "").slice(0, 24);
  }

  if ((!lastName || !lastName.trim()) && twoWordNameMatch) {
    lastName = twoWordNameMatch[2] ?? "";
  }

  return {
    first_name: inferredFirst || "Patient",
    last_name: lastName,
    dob,
    phone,
    email,
  };
}

export default function AiAssistantPage() {
  const [sessionId, setSessionId] = useState<string>("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [typing, setTyping] = useState(false);

  const [appointmentOptions, setAppointmentOptions] =
    useState<AppointmentOptions | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null);

  const [voicePhone, setVoicePhone] = useState("");
  const [voiceStatus, setVoiceStatus] = useState<string | null>(null);

  const [bookingError, setBookingError] = useState<string | null>(null);

  const [confirmedAppointment, setConfirmedAppointment] =
    useState<Appointment | null>(null);
  const [confirmedDoctorName, setConfirmedDoctorName] = useState<string | null>(
    null
  );

  useEffect(() => {
    setSessionId(crypto.randomUUID());
    setMessages([
      {
        id: crypto.randomUUID(),
        role: "assistant",
        content:
          "Hi! I can help you schedule a Kyron Medical appointment. What symptoms are you experiencing, and what days/times work best?",
      },
    ]);
  }, []);

  const lastAssistantMessage = useMemo(() => {
    return [...messages].reverse().find((m) => m.role === "assistant")?.content ?? "";
  }, [messages]);

  // Detect the SMS preference prompt from either /api/chat or /api/appointment.
  const awaitingSms = useMemo(() => {
    const txt = lastAssistantMessage.toLowerCase();
    return txt.includes("sms reminder") && txt.includes("(yes/no)");
  }, [lastAssistantMessage]);

  const appointmentSummary = useMemo(() => {
    if (!appointmentOptions || !selectedSlot) return null;
    return `${appointmentOptions.doctor.name} · ${selectedSlot.appointment_date} ${selectedSlot.appointment_time}`;
  }, [appointmentOptions, selectedSlot]);

  const extractedPatient = useMemo(() => {
    return extractPatientFromMessages(messages);
  }, [messages]);

  const patientOkForSlots =
    Boolean(extractedPatient.last_name) &&
    Boolean(extractedPatient.dob) &&
    Boolean(extractedPatient.phone) &&
    Boolean(extractedPatient.email);

  const sendMessage = async (userText: string) => {
    if (!userText.trim() || !sessionId) return;

    setBookingError(null);
    setVoiceStatus(null);

    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: userText.trim(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setTyping(true);

    try {
      const data = await postChat({
        user_message: userMsg.content,
        session_id: sessionId,
      });

      const assistantMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: data.reply,
      };
      setMessages((prev) => [...prev, assistantMsg]);

      setAppointmentOptions(data.appointmentOptions ?? null);
      setSelectedSlot(null);

      if (data.booked?.appointment) {
        setConfirmedAppointment(data.booked.appointment);
        setConfirmedDoctorName(data.booked.doctor_name ?? null);
      }
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "something went wrong";
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: `Sorry, ${message}.`,
        },
      ]);
    } finally {
      setTyping(false);
    }
  };

  const onSend = () => {
    if (typing) return;
    const userText = input.trim();
    if (!userText) return;
    setInput("");
    void sendMessage(userText);
  };

  const onConfirmAppointment = async () => {
    if (!appointmentOptions || !selectedSlot) return;
    setBookingError(null);

    try {
      const response = await postAppointment({
        doctor_id: appointmentOptions.doctor.id,
        appointment_date: selectedSlot.appointment_date,
        appointment_time: selectedSlot.appointment_time,
        reason: `Appointment scheduling via AI chat (session ${sessionId}).`,
        patient: extractedPatient,
        send_sms_reminder: false,
        session_id: sessionId,
      });

      setConfirmedAppointment(response.appointment);
      setConfirmedDoctorName(
        response.doctor_name ?? appointmentOptions.doctor.name
      );

      setAppointmentOptions(null);
      setSelectedSlot(null);

      if (response.smsPrompt && typeof response.smsPrompt === "string") {
        setMessages((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            role: "assistant",
            content: response.smsPrompt,
          },
        ]);
      }
    } catch (e: unknown) {
      setBookingError(
        e instanceof Error ? e.message : "Failed to book appointment."
      );
    }
  };

  const onContinueVoice = async () => {
    setVoiceStatus(null);
    try {
      const res = await postVoiceCall({
        phone_number: voicePhone,
        session_id: sessionId,
      });
      setVoiceStatus(
        res && typeof res === "object" && "call" in res
          ? "Calling started. You should receive an incoming call soon."
          : "Voice request sent."
      );
    } catch (e: unknown) {
      setVoiceStatus(e instanceof Error ? e.message : "Voice call failed.");
    }
  };

  const appointmentPanel = (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="mt-5 pt-5 border-t border-white/10"
    >
      {appointmentOptions && !confirmedAppointment && patientOkForSlots ? (
        <div className="space-y-4">
          <div>
            <div className="text-white font-semibold">Available Appointment Slots</div>
            <div className="text-white/70 text-sm mt-1">
              {appointmentOptions.doctor.name} · {appointmentOptions.doctor.specialty}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-2">
            {appointmentOptions.slots.map((s) => {
              const active =
                selectedSlot?.appointment_date === s.appointment_date &&
                selectedSlot?.appointment_time === s.appointment_time;
              return (
                <button
                  key={`${s.appointment_date}_${s.appointment_time}`}
                  onClick={() => setSelectedSlot(s)}
                  className={`w-full text-left rounded-3xl px-4 py-3 border shadow-2xl transition
                    ${
                      active
                        ? "bg-white/20 border-white/30 text-white"
                        : "bg-white/10 border-white/10 text-white/90 hover:bg-white/15"
                    }`}
                >
                  <div className="text-sm font-medium">{s.appointment_date}</div>
                  <div className="text-xs text-white/70">{s.appointment_time}</div>
                </button>
              );
            })}
          </div>

          <div className="pt-2">
            {selectedSlot && (
              <div className="mt-2 text-xs text-white/60">
                Selected: {appointmentSummary}
              </div>
            )}

            {bookingError && (
              <div className="mt-3 text-sm text-red-200">{bookingError}</div>
            )}

            <Button
              onClick={onConfirmAppointment}
              disabled={!selectedSlot}
              className="mt-4 w-full"
            >
              Confirm Appointment
            </Button>
          </div>
        </div>
      ) : confirmedAppointment ? (
        <div className="space-y-3">
          <div className="text-white font-semibold">Appointment Confirmed</div>
          <div className="text-white/70 text-sm">
            Your visit is booked. A confirmation email has been sent.
          </div>

          <div className="pt-2 text-white text-sm">
            <div>
              <span className="text-white/70">Doctor:</span>{" "}
              {confirmedDoctorName ?? appointmentOptions?.doctor?.name ?? "—"}
            </div>
            <div>
              <span className="text-white/70">Date:</span>{" "}
              {confirmedAppointment.appointment_date}
            </div>
            <div>
              <span className="text-white/70">Time:</span>{" "}
              {confirmedAppointment.appointment_time}
            </div>
          </div>

          {awaitingSms && (
            <div className="pt-4">
              <div className="text-white font-semibold text-sm">
                SMS reminders
              </div>
              <div className="text-white/70 text-xs mt-1">
                Reply “yes” to get SMS confirmation reminders.
              </div>
              <div className="flex gap-3 mt-3">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => void sendMessage("yes")}
                  disabled={typing}
                >
                  Yes
                </Button>
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => void sendMessage("no")}
                  disabled={typing}
                >
                  No
                </Button>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          <div className="text-white font-semibold">Appointment Options</div>
          <div className="text-white/70 text-sm">
            Share your symptoms and details in chat to see available slots.
          </div>
        </div>
      )}
    </motion.div>
  );

  return (
    <div className="min-h-screen w-full relative overflow-hidden bg-gradient-to-b from-black via-slate-950 to-black">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.18),transparent_35%),radial-gradient(circle_at_70%_40%,rgba(59,130,246,0.18),transparent_45%),radial-gradient(circle_at_50%_80%,rgba(168,85,247,0.14),transparent_40%)]" />

      <div className="relative mx-auto max-w-6xl px-4 py-10">
        <div className="flex items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-3xl bg-white/10 backdrop-blur-xl shadow-2xl flex items-center justify-center">
              <Sparkles className="h-6 w-6 text-white" />
            </div>
            <div>
              <div className="text-white text-lg font-semibold leading-tight">
                Kyron Medical
              </div>
              <div className="text-white/70 text-sm">
                AI appointment scheduling (chat + voice)
              </div>
            </div>
          </div>

          <div className="hidden sm:flex items-center gap-3">
            <div className="px-4 py-2 rounded-full bg-white/10 backdrop-blur-xl shadow-2xl text-white/80 text-sm">
              Liquid Glass UI
            </div>
          </div>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
          className="rounded-3xl bg-white/10 backdrop-blur-xl shadow-2xl border border-white/10 overflow-hidden"
        >
          <div className="p-5 border-b border-white/10">
            <div className="text-white font-semibold">AI Chat</div>
            <div className="text-white/70 text-sm">
              Tell us what you need, and we will schedule.
            </div>
          </div>

          <div className="p-5">
            <div className="h-[420px] overflow-y-auto space-y-4">
              {messages.map((m) => (
                <motion.div
                  key={m.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2 }}
                  className={`flex ${
                    m.role === "user" ? "justify-end" : "justify-start"
                  }`}
                >
                  <div
                    className={`max-w-[85%] whitespace-pre-wrap rounded-3xl px-4 py-3 shadow-2xl border
                      ${
                        m.role === "user"
                          ? "bg-white/20 border-white/20 text-white"
                          : "bg-white/10 border-white/10 text-white"
                      }`}
                  >
                    <div className="text-sm leading-relaxed">{m.content}</div>
                  </div>
                </motion.div>
              ))}

              <AnimatePresence>
                {typing && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="flex justify-start"
                  >
                    <div className="bg-white/10 border border-white/10 rounded-3xl px-4 py-3 text-white/80">
                      Assistant is typing...
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {appointmentPanel}

            <div className="mt-5 pt-5 border-t border-white/10">
              <div className="text-white font-semibold">
                Continue via Phone Call
              </div>
              <div className="text-white/70 text-sm mt-1">
                Pick up where chat left off.
              </div>
              <div className="mt-4 space-y-3">
                <Input
                  value={voicePhone}
                  onChange={(e) => setVoicePhone(e.target.value)}
                  placeholder="+1..."
                />
                <Button
                  onClick={onContinueVoice}
                  className="w-full"
                  variant="outline"
                >
                  <Phone className="h-4 w-4 mr-2" />
                  Continue via Phone Call
                </Button>
                {voiceStatus && (
                  <div className="text-white/80 text-sm">{voiceStatus}</div>
                )}
              </div>
            </div>

            <div className="mt-5 pt-5 border-t border-white/10">
              <div className="flex gap-3">
                <Input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="e.g., knee pain and swelling, tomorrow at 9am"
                  className="flex-1"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") onSend();
                  }}
                />
                <Button
                  onClick={onSend}
                  disabled={typing || input.trim().length === 0}
                  className="shrink-0"
                >
                  <Send className="h-4 w-4 mr-2" />
                  Send
                </Button>
              </div>
              <div className="mt-3 text-xs text-white/60">
                This MVP only supports appointment scheduling.
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}


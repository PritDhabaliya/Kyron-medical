# Kyron AI Assistant (MVP)

Production-oriented MVP for Kyron Medical: patients schedule appointments via **AI chat** or **voice call**, with confirmations sent by **email** (SendGrid) and optional **SMS** (Twilio).

## Architecture

```
Patient Web UI (Next.js)
  - Chat -> POST /api/chat -> Express API
  - Slot select -> POST /api/appointment -> Express API
  - Voice handoff -> POST /api/voice/call -> Express API -> Vapi

Express API
  - Supabase PostgreSQL (via DATABASE_URL)
  - SendGrid (appointment confirmation email)
  - Twilio (optional SMS reminders)
  - OpenAI GPT-4o (chat assistant scheduling flow)
```

## Tech Stack

- Frontend: Next.js (App Router), React, Tailwind CSS, Framer Motion, shadcn-style UI components
- Backend: Node.js + Express.js (TypeScript)
- Database: Supabase PostgreSQL (uses `DATABASE_URL` from `.env`)
- AI: OpenAI GPT-4o
- Voice AI: Vapi
- Messaging: SendGrid, Twilio
- Deployment target: AWS EC2 + Nginx + Let’s Encrypt

## Local Setup

1. Ensure you have Node.js installed.
2. Install dependencies:
   - `npm install`
3. Start the app:
   - `npm run dev`

### Database

Run `database/schema.sql` and `database/seed.sql` in Supabase (if your tables aren’t already present).

Tables:
- `patients`
- `doctors` (seeded with the hardcoded doctors)
- `appointments`
- `chat_sessions`

## API Endpoints (MVP)

- `POST /api/chat` (AI chat scheduling)
- `POST /api/patient` (store patient)
- `GET /api/doctors` (hardcoded/DB doctors list)
- `GET /api/availability` (slot generation)
- `POST /api/appointment` (store appointment + email/SMS)
- `POST /api/voice/call` (start Vapi call with chat context)

## Deployment (EC2)

1. Provision an EC2 instance.
2. Install Node.js, configure environment variables from `.env`.
3. Build:
   - `npm install`
   - `npm run build`
4. Run production processes:
   - Next: `npm --workspace frontend run start`
   - Backend: `npm --workspace backend run start`
5. Put Nginx in front as a reverse proxy:
   - Route `/` to Next.js
   - Route `/api` to Express backend
6. Enable HTTPS using Let’s Encrypt.


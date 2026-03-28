# Hugging Face Spaces (Docker). README: sdk: docker, app_port: 7860
# bookworm-slim: fewer Alpine/native-module issues; logs below help when HF UI looks "stuck".

FROM node:20-bookworm-slim

RUN echo "=== HF build: base image ready ==="

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=7860

COPY package.json package-lock.json ./
RUN echo "=== HF build: copied package.json / lockfile ==="

COPY backend ./backend
COPY frontend ./frontend
COPY database ./database
COPY config ./config
RUN echo "=== HF build: copied source (if this took long, context upload was the delay) ==="

RUN echo "=== HF build: npm ci starting (no output until done; often 5–15+ min) ===" \
  && npm ci \
  && echo "=== HF build: npm ci finished ==="

RUN echo "=== HF build: tsc backend ===" \
  && npm --workspace backend run build \
  && echo "=== HF build: tsc done ==="

RUN echo "=== HF build: npm prune ===" \
  && npm prune --omit=dev \
  && echo "=== HF build: prune done ==="

EXPOSE 7860

CMD ["npm", "--workspace", "backend", "run", "start"]

# Hugging Face Spaces (Docker). README must declare sdk: docker in YAML frontmatter.
# Space serves the Express API on port 7860 (HF default).

FROM node:20-alpine

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=7860

COPY package.json package-lock.json ./
COPY backend ./backend
COPY frontend ./frontend
COPY database ./database
COPY config ./config

RUN npm ci
RUN npm --workspace backend run build
RUN npm prune --omit=dev

EXPOSE 7860

CMD ["npm", "--workspace", "backend", "run", "start"]

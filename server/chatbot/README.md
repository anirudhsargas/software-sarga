# SARGA Chatbot Service

Lightweight Express chatbot for SARGA printing features: instant quotes, product guidance, file upload checks, order tracking, FAQs, and ticket escalation.

Quick start

1. From `server/chatbot` install dependencies:
```bash
npm install
```
2. Start the service:
```bash
npm start
```
3. Endpoints
- `POST /chat` JSON { message } → intent-aware reply
- `POST /upload` form-data with `file` → basic file preflight checks
- `POST /ticket` JSON { message } → create support ticket

Notes
- This is a rule-based prototype. Integrate an NLP service (Rasa, Dialogflow, or an LLM) for production.
- For robust PDF preflight and font/CMYK checks use professional preflight tools.

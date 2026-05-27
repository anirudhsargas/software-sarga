# SARGA WEBSITE — REFACTORED PROMPTS + HYBRID LLM SETUP
**Updated:** 2026-05-27  
**Stack:** React 19 + Vite | Express.js | MySQL  
**LLM Strategy:** Hybrid (Rule-based + Optional API)

---

## TABLE OF CONTENTS
1. [LLM Architecture](#llm-architecture)
2. [Refactored Prompts 1-8](#refactored-prompts)
3. [Database Migrations](#database-migrations)
4. [Environment Setup](#environment-setup)
5. [Revised Implementation Timeline](#timeline)

---

## LLM ARCHITECTURE

### Decision Tree
```
User Query
├─ Rule Match (Intent Detection)?
│  ├─ "track|order" → /track page link
│  ├─ "price|cost|quote" → /contact page link
│  ├─ "location|address|branch" → Show both branches
│  ├─ "phone|call|whatsapp" → Phone/WhatsApp link
│  ├─ "hours|open|close" → Opening hours
│  ├─ "[service name]" → Service description from DB
│  └─ "wedding|visiting|card|flex|banner|etc" → Service details
│
├─ Rule Match Found?
│  ├─ YES → Return cached response + confidence 0.95
│  └─ NO → Continue below
│
└─ Embedding Search (FAQ/KB)?
   ├─ Find similar Q in knowledge_base table
   ├─ Similarity score > 0.75?
   │  ├─ YES → Format FAQ answer + confidence 0.85
   │  └─ NO → Continue below
   │
   └─ API Fallback (Optional)?
      ├─ ANTHROPIC_API_KEY exists?
      │  ├─ YES → Call Claude API
      │  └─ NO → Graceful fallback
      └─ API fails? → Graceful fallback
         └─ Return: "Let me connect you with our team..."
```

### Backend Service: src/services/chatService.js

```js
import Anthropic from '@anthropic-ai/sdk';
import { db } from '../config/database.js';

const client = new Anthropic();

// Intent patterns for rule-based matching
const INTENTS = {
  track: {
    patterns: /track|order|status|job code|where is/i,
    response: "You can track your order at sarga.in/track using your job code (e.g., PBA-20260527-001).",
    confidence: 0.95
  },
  quote: {
    patterns: /price|cost|rate|quote|estimate|how much/i,
    response: "Pricing depends on quantity, paper type, and printing method. Request a free quote at sarga.in/contact or email sargapba@gmail.com.",
    confidence: 0.95
  },
  location: {
    patterns: /location|address|where|branch|perambra|meppayur/i,
    response: "We have two branches: **Perambra** (customer hub) and **Meppayur** (offset production), both in Kozhikode District, Kerala. Open Mon–Sat 9AM–7PM IST.",
    confidence: 0.95
  },
  contact: {
    patterns: /phone|call|whatsapp|contact|reach us|email/i,
    response: "📞 **Perambra:** sargapba@gmail.com | **Meppayur:** sargaoffsetmpr@gmail.com | WhatsApp: wa.me/+91XXXXX",
    confidence: 0.95
  },
  hours: {
    patterns: /hours|open|close|timing|when|availability/i,
    response: "We're open **Monday to Saturday, 9:00 AM – 7:00 PM IST**.",
    confidence: 0.95
  }
};

// Rule-based matcher
export async function detectIntent(message) {
  for (const [intent, config] of Object.entries(INTENTS)) {
    if (config.patterns.test(message)) {
      return {
        intent,
        response: config.response,
        confidence: config.confidence,
        source: 'rule'
      };
    }
  }
  return null;
}

// Embedding-based FAQ search
export async function searchKnowledgeBase(message) {
  try {
    // Requires simple embedding model (e.g., Sentence Transformers or similar)
    // For MVP: Just do substring matching on FAQ titles
    const [results] = await db.execute(
      "SELECT question, answer FROM faq_knowledge_base WHERE MATCH(question, answer) AGAINST(? IN BOOLEAN MODE) LIMIT 1",
      [message]
    );
    
    if (results.length > 0) {
      return {
        question: results[0].question,
        answer: results[0].answer,
        confidence: 0.85,
        source: 'knowledge_base'
      };
    }
  } catch (err) {
    console.error('FAQ search error:', err);
  }
  
  return null;
}

// API-based chat (fallback)
export async function chatWithAI(message, history = []) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return null;  // No API key, skip to graceful fallback
  }

  try {
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 200,
      system: `You are Sarga Prints' helpful assistant. Keep replies to 2-3 sentences.
- Business: 30-year printing company in Kozhikode, Kerala
- Branches: Perambra (customer hub) & Meppayur (production)
- Services: Offset printing, digital printing, wedding cards, visiting cards, flex banners, binding, lamination
- Hours: Mon–Sat 9AM–7PM IST
- Contact: sargapba@gmail.com (Perambra), sargaoffsetmpr@gmail.com (Meppayur)
- Track: sarga.in/track with job code
If unsure, say "Let me connect you with our team" and provide contact info.`,
      messages: [
        ...history.map(m => ({ role: m.role, content: m.text })),
        { role: 'user', content: message }
      ]
    });

    return {
      text: response.content[0].text,
      confidence: 0.9,
      source: 'api'
    };
  } catch (err) {
    console.error('Anthropic API error:', err.message);
    return null;  // Fall through to graceful fallback
  }
}

// Main orchestrator
export async function processMessage(message, history = []) {
  // Step 1: Rule-based intent
  const ruleMatch = await detectIntent(message);
  if (ruleMatch) {
    return ruleMatch;
  }

  // Step 2: FAQ/Knowledge base search
  const faqMatch = await searchKnowledgeBase(message);
  if (faqMatch) {
    return faqMatch;
  }

  // Step 3: API fallback
  const apiResponse = await chatWithAI(message, history);
  if (apiResponse) {
    return apiResponse;
  }

  // Step 4: Graceful fallback
  return {
    text: "Thanks for reaching out! For detailed assistance, please contact us:\n📧 sargapba@gmail.com (Perambra) | sargaoffsetmpr@gmail.com (Meppayur)\n☎️ WhatsApp: wa.me/+91XXXXX\nWe'll get back to you within 24 hours!",
    confidence: 0.5,
    source: 'fallback'
  };
}
```

---

## REFACTORED PROMPTS

### PROMPT 0 — Database Migrations (NEW — RUN FIRST)

```
Set up database tables for the Sarga Prints website.

FILE: backend/migrations/20260527_website_tables.sql

Create four tables:

1. website_cart_inquiries:
   - id (INT, auto-increment PK)
   - uuid (VARCHAR 36, indexed)
   - customer_name (VARCHAR 100)
   - phone (VARCHAR 15)
   - email (VARCHAR 100, nullable)
   - branch (VARCHAR 20: 'Perambra' or 'Meppayur')
   - items_json (JSON: [{service, quantity, notes, subtype}])
   - status (ENUM: 'new', 'viewed', 'quoted', 'closed')
   - created_at, updated_at (DATETIME)
   - INDEX on uuid, status

2. faq_knowledge_base:
   - id (INT, auto-increment PK)
   - question (VARCHAR 500, FULLTEXT indexed)
   - answer (TEXT, FULLTEXT indexed)
   - category (VARCHAR 50: 'services', 'tracking', 'contact', 'general')
   - created_at (DATETIME)
   Example rows:
     - "Can you print visiting cards?" → "Yes, we offer premium visiting card printing..."
     - "What are your working hours?" → "Mon–Sat 9AM–7PM IST"
     - "Do you offer wedding card design?" → "Yes, custom design with offset/digital options..."

3. chat_sessions:
   - id (INT, auto-increment PK)
   - uuid (VARCHAR 36, indexed, unique)
   - messages (JSON array: [{role:'user'|'bot', text, timestamp}])
   - created_at, updated_at (DATETIME)
   - INDEX on uuid, updated_at

4. client_logs:
   - id (INT, auto-increment PK)
   - uuid (VARCHAR 36, nullable, indexed)
   - message (VARCHAR 500)
   - error_message (TEXT, nullable)
   - url (VARCHAR 500)
   - ip_address (VARCHAR 45)
   - created_at (DATETIME, indexed)
```

---

### PROMPT 1 — Chatbot Backend (REFACTORED for Hybrid)

```
Create the Sarga Prints chatbot backend with hybrid LLM (rules + optional API + fallback).

FILE: src/services/chatService.js
Copy the chatService.js code from REFACTORED_PROMPTS_HYBRID.md above.

FILE: src/routes/website.js (add endpoint)

ADD to existing router:
POST /api/website/chat

BODY: { message: string, history: [{role, text}] }

LOGIC:
1. Validate: message required, max 500 chars. history max 10 items.
2. Apply chatLimiter middleware (20 req/min per IP).
3. Apply uuidGuard middleware (validate X-Sarga-UUID header).
4. Extract uuid from req.userUuid.
5. Import and call chatService.processMessage(message, history).
6. The service will:
   a. Try rule-based intent detection → return immediately if matched
   b. Try FAQ/knowledge base search → return if matched
   c. Try API (if ANTHROPIC_API_KEY set) → return if successful
   d. Fall back to graceful message if all above fail
7. Save message to chat_sessions table (both user and bot messages):
   await db.execute(
     'UPDATE chat_sessions SET messages = JSON_ARRAY_APPEND(messages, "$", ?) WHERE uuid = ?',
     [JSON.stringify({role: 'user', text: message, timestamp: new Date().toISOString()}), uuid]
   )
   Then repeat for bot response.
8. Return: res.json({ reply: response.text, confidence: response.confidence, source: response.source })

OPTIONAL: Endpoint to get chat history
GET /api/website/chat-history
- Return last 20 messages from chat_sessions for the user's UUID
```

---

### PROMPT 2 — Chatbot Frontend (REFACTORED)

```
Create a WhatsApp-style floating chatbot for React 19 + Vite.

FILES TO CREATE:
- src/components/Chatbot/Chatbot.jsx
- src/components/Chatbot/Chatbot.css

BEHAVIOR (same as original Prompt 1, but updated props):
1. Floating button: bottom-right, 60px circle, #25D366 background, MessageCircle icon
2. Chat panel: 380px wide, 520px tall, #075E54 header, #ECE5DD background
3. Messages: User bubbles #DCF8C6 right, bot bubbles #FFFFFF left, timestamps
4. Quick reply chips: "Track Order", "Get a Quote", "Call Us", "Services"
5. Input: white bar, green send button
6. Typing indicator: 3 dots for 800ms
7. Session storage: sessionStorage key 'sarga_chat'
8. API calls: POST /api/website/chat with headers including X-Sarga-UUID
9. On open: Show greeting "Hi! I'm Sarga's assistant. How can I help? 😊"
10. Error handling: Show "Sorry, I'm having trouble. Please call us." and log to /api/logs/client

CHANGES FROM ORIGINAL:
- Parse response.source field from API: display confidence indicator or badge showing "Instant Answer", "FAQ", "AI", etc.
- Add option to "Talk to human" button that opens Contact page in new tab
- Store full history in session to avoid repeated context-passing
```

---

### PROMPT 3 — Quote Cart System (UNCHANGED)

```
[Same as original Prompt 3 from feature plan]
```

---

### PROMPT 4 — SEO + Schema (UNCHANGED, with one addition)

```
[Same as original Prompt 4 from feature plan]

ADDITION: In Home.jsx FAQ section, source questions from backend:
GET /api/website/faq
Returns: array of {question, answer, category}
Map to accordion items.
This way FAQs are dynamic and can be updated without code changes.
```

---

### PROMPT 5 — Security (UNCHANGED)

```
[Same as original Prompt 5]
```

---

### PROMPT 6 — Error Screens (UNCHANGED)

```
[Same as original Prompt 6]
```

---

### PROMPT 7 — Logging + Monitoring (ENHANCED)

```
[Same as original Prompt 7, plus:]

Add endpoint: POST /api/logs/client
- Body: { message, error, url, timestamp }
- Store in client_logs table
- Log with appLogger.warn()

Add monitoring dashboard route (for internal use):
GET /api/admin/dashboard
- Returns JSON with:
  - Total messages in last 24h (from chat_sessions)
  - Cart inquiries in last 24h (from website_cart_inquiries)
  - Error rate (from client_logs)
  - Top intents detected (count by intent from chat sessions or via logging)
  - Response times (from request logger middleware)
  - Health status
```

---

### PROMPT 8 — llms.txt + robots.txt + sitemap (UNCHANGED)

```
[Same as original Prompt 8]
```

---

## DATABASE MIGRATIONS

### File: backend/migrations/20260527_website_tables.sql

```sql
-- Website Cart Inquiries
CREATE TABLE IF NOT EXISTS website_cart_inquiries (
  id INT AUTO_INCREMENT PRIMARY KEY,
  uuid VARCHAR(36) NOT NULL,
  customer_name VARCHAR(100) NOT NULL,
  phone VARCHAR(15) NOT NULL,
  email VARCHAR(100),
  branch ENUM('Perambra', 'Meppayur') NOT NULL,
  items_json JSON NOT NULL,
  status ENUM('new','viewed','quoted','closed') DEFAULT 'new',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_uuid (uuid),
  KEY idx_status (status),
  KEY idx_created (created_at)
);

-- FAQ/Knowledge Base
CREATE TABLE IF NOT EXISTS faq_knowledge_base (
  id INT AUTO_INCREMENT PRIMARY KEY,
  question VARCHAR(500) NOT NULL,
  answer TEXT NOT NULL,
  category VARCHAR(50),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FULLTEXT KEY ft_question (question),
  FULLTEXT KEY ft_answer (answer)
);

-- Chat Sessions
CREATE TABLE IF NOT EXISTS chat_sessions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  uuid VARCHAR(36) NOT NULL UNIQUE,
  messages JSON,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_uuid (uuid),
  KEY idx_updated (updated_at)
);

-- Client Logs
CREATE TABLE IF NOT EXISTS client_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  uuid VARCHAR(36),
  message VARCHAR(500),
  error_message TEXT,
  url VARCHAR(500),
  ip_address VARCHAR(45),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  KEY idx_uuid (uuid),
  KEY idx_created (created_at)
);

-- Insert seed FAQ data
INSERT INTO faq_knowledge_base (question, answer, category) VALUES
('Where is Sarga Prints located?', 'We have two branches: Perambra (customer hub) and Meppayur (offset production), both in Kozhikode District, Kerala, India.', 'contact'),
('How do I track my order?', 'Visit sarga.in/track and enter your job code (e.g., PBA-20260527-001) to see real-time status.', 'tracking'),
('Does Sarga do wedding card printing?', 'Yes! We offer custom wedding card printing with offset and digital printing options, die-cutting, and lamination finishes.', 'services'),
('What are your working hours?', 'We are open Monday to Saturday, 9:00 AM to 7:00 PM IST. Closed on Sundays and public holidays.', 'contact'),
('What types of printing do you offer?', 'Offset printing (large volumes), digital/laser printing (short runs), photostat, flex/poly banner printing, lamination, binding, die-cutting, and more.', 'services'),
('Can you do visiting card printing?', 'Yes, we specialize in premium visiting card printing with various finishes, colors, and materials.', 'services'),
('How much does printing cost?', 'Pricing depends on quantity, paper type, color, and printing method. Request a free quote at sarga.in/contact.', 'pricing'),
('How do I request a quote?', 'Visit sarga.in/contact, fill the form, or call us directly. You can also use our quote cart feature to add services and submit.', 'contact');
```

---

## ENVIRONMENT SETUP

### File: .env.example

```
# Database
DATABASE_URL=mysql://user:password@host/sarga_staging

# LLM (OPTIONAL - leave blank to use rules + fallback only)
ANTHROPIC_API_KEY=sk-ant-xxxxx

# Or use Open Router (cheaper, supports multiple models)
OPENROUTER_API_KEY=sk-or-xxxxx
OPENROUTER_MODEL=mistral/mistral-7b-instruct:free

# Security
JWT_SECRET=your-secret-key
SESSION_SECRET=another-secret

# Services
SENTRY_DSN=https://xxxxx@sentry.io/12345
LOGTAIL_SOURCE_TOKEN=xxxxx  # For log aggregation

# Email (for password reset)
EMAIL_SERVICE=gmail  # or sendgrid, mailgun
EMAIL_USER=noreply@sarga.in
EMAIL_PASSWORD=app-specific-password

# Monitoring
LOG_LEVEL=info
DEPLOY_COLOR=blue
APP_VERSION=1.0.0

# Frontend (vite .env)
VITE_API_URL=https://api.sarga.in
VITE_SENTRY_DSN=https://xxxxx@sentry.io/12345
```

### Installation Commands

```bash
# Backend dependencies
npm install @anthropic-ai/sdk helmet express-rate-limit express-validator dompurify winston nodemailer

# Frontend dependencies (if not already installed)
npm install react-helmet-async lucide-react react-hot-toast

# Optional: For local embeddings (Sentence Transformers via Python)
pip install sentence-transformers
```

---

## REVISED IMPLEMENTATION TIMELINE

```
✅ PREP (2 hours)
  - Create .env.example
  - Run database migrations
  - Install dependencies (backend + frontend)

📅 DAY 1 (3 hours)
  - Prompt 8: llms.txt + robots.txt + sitemap.xml + index.html SEO (30 min)
  - Prompt 4: react-helmet-async + schema + FAQ section (2 hrs)
  - Prompt 0: Database setup (30 min)

📅 DAY 2 (4 hours)
  - Prompt 5: Security (UUID, SQLi, XSS, rate limiting, Helmet) (3 hrs)
  - Prompt 7: Logging + health endpoint (1 hr)

📅 DAY 3 (3 hours)
  - Prompt 6: Error screens + ErrorBoundary (1.5 hrs)
  - Create chatService.js (Hybrid LLM orchestrator) (1.5 hrs)

📅 DAY 4 (3 hours)
  - Prompt 1: Chatbot backend endpoint (1.5 hrs)
  - Prompt 2: Chatbot frontend (WhatsApp UI) (1.5 hrs)

📅 DAY 5 (3 hours)
  - Prompt 3: Quote Cart system (3 hrs)

📅 DAY 6 (1 hour)
  - Manual: Content fixes (30+ years, missing services, error handling) (1 hr)

📅 DAY 7 (2 hours)
  - Blue/green setup + GitHub Actions workflow (2 hrs)

TOTAL: 9 days (more realistic than original 7)
```

---

## HYBRID LLM DECISION GUIDE

Choose based on your needs:

### ✅ Use HYBRID (Recommended for Sarga)
- Most queries are about same 5-10 topics (track, quote, hours, contact, services)
- Budget conscious
- Want full control over responses
- Don't need cutting-edge AI

### ✅ Use PURE API (Claude/GPT)
- Want best possible quality
- Have budget ($50-200/mo)
- Expect diverse customer questions
- Happy to outsource intelligence

### ✅ Use LOCAL LLM (Ollama)
- Self-hosted preference
- Have GPU infrastructure
- Offline-first requirement
- Can tolerate slower responses

### ✅ Use OPEN ROUTER (Middle ground)
- Pay-as-you-go ($0.001-0.05 per token)
- Access to multiple models (Claude, Mistral, Llama)
- No upfront cost

---

## MONITORING HYBRID LLM PERFORMANCE

Track these metrics from chat_sessions:

```sql
-- Top intents detected
SELECT 
  SUBSTRING(messages, 1, 50) as query,
  COUNT(*) as count
FROM chat_sessions
WHERE messages LIKE '%"role":"user"%'
GROUP BY query
ORDER BY count DESC
LIMIT 10;

-- Rule match vs API fallback usage
SELECT
  (SELECT COUNT(*) FROM chat_sessions WHERE created_at > NOW() - INTERVAL 1 DAY) as total_chats,
  (SELECT COUNT(*) FROM chat_sessions WHERE messages LIKE '%"source":"rule"%') as rule_matches,
  (SELECT COUNT(*) FROM chat_sessions WHERE messages LIKE '%"source":"api"%') as api_calls,
  (SELECT COUNT(*) FROM chat_sessions WHERE messages LIKE '%"source":"fallback"%') as fallbacks;
```

---

**This refactored plan gives you flexibility: start with rules-only, add API later if needed.**

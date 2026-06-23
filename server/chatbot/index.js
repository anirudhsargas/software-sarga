const express = require('express');
const bodyParser = require('body-parser');
const multer = require('multer');
const sharp = require('sharp');
const { PDFDocument } = require('pdf-lib');
const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(bodyParser.json());

const upload = multer({ dest: path.join(__dirname, 'uploads/') });

// Simple in-memory orders & tickets (persist to files)
const ORDERS_FILE = path.join(__dirname, 'orders.json');
const TICKETS_FILE = path.join(__dirname, 'tickets.json');

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (_e) {
    return fallback;
  }
}

function writeJson(file, obj) {
  fs.writeFileSync(file, JSON.stringify(obj, null, 2));
}

// Load or init
let orders = readJson(ORDERS_FILE, {});
let tickets = readJson(TICKETS_FILE, []);

// Load product catalog
const PRODUCTS_FILE = path.join(__dirname, 'products.json');
const products = readJson(PRODUCTS_FILE, []);

function findProductByName(name) {
  if (!name) return null;
  const n = name.toLowerCase().trim();
  return products.find(p => p.name.toLowerCase() === n || p.key.toLowerCase() === n || (p.aliases||[]).map(a=>a.toLowerCase()).includes(n) || p.category.toLowerCase() === n) || null;
}

// Utility: simple intent detection for quotes / product guidance
function parseQuoteRequest(text) {
  const qtyMatch = text.match(/(\d{1,7})\s*(pcs|pieces|cards|visiting|invites|items)?/i);
  const qty = qtyMatch ? parseInt(qtyMatch[1], 10) : null;
  const productMatch = products.map(p => p.name).join('|');
  const regex = new RegExp(`(${productMatch}|a3|a4|poster|flex|banner)`, 'i');
  const productFound = text.match(regex);
  const product = productFound ? productFound[1] : null;
  return { qty, product };
}

function generateQuote({ product = 'item', qty = 100, size = 'standard', paper = 'standard', color = 'full' }) {
  let unit = 10; // fallback
  let productObj = null;
  if (product) {
    productObj = findProductByName(String(product));
  }
  if (productObj) {
    unit = productObj.basePrice;
  } else {
    // fallback small table
    const fallback = { 'visiting cards': 0.6, brochure: 5, banner: 800, invitation: 30, flex: 500, poster: 50, item: 10 };
    unit = fallback[String(product).toLowerCase()] || 10;
  }

  if (String(size).toLowerCase().includes('a3')) unit *= 2;
  if (String(paper).toLowerCase().includes('premium')) unit *= 1.5;
  if (String(color).toLowerCase().includes('b&w') || String(color).toLowerCase().includes('mono')) unit *= 0.7;

  const qtyNumber = Math.max(1, qty || 1);
  const subtotal = unit * qtyNumber;
  const gst = subtotal * 0.18;
  const total = subtotal + gst;

  return {
    product: productObj ? productObj.key : String(product),
    productName: productObj ? productObj.name : product,
    unit: Number(unit.toFixed(2)),
    qty: qtyNumber,
    subtotal: Number(subtotal.toFixed(2)),
    gst: Number(gst.toFixed(2)),
    total: Number(total.toFixed(2)),
    currency: 'INR'
  };
}

const FAQ = {
  timings: 'We are open Mon-Sat 9:30–19:00. Sunday by appointment.',
  payment: 'We accept UPI, card, netbanking, and cash on pickup.',
  lamination: 'Matt and glossy lamination available; glossy shows vibrant colors.',
  gst: 'Yes, GST invoices are provided for orders above the GST threshold.'
};

app.post('/chat', (req, res) => {
  const { message, orderId, phone } = req.body || {};
  if (!message) return res.status(400).json({ error: 'message required' });

  const text = message.toLowerCase();

  // Order tracking
  if (/order\s*id|track|tracking|order status/i.test(message) || orderId) {
    const id = orderId || (text.match(/([A-Z0-9-]{4,})/) || [])[1];
    const key = id || phone;
    if (!key) return res.json({ reply: 'Please enter your registered mobile number or job code to lookup status.' });
    const order = orders[key];
    if (order) return res.json({ reply: `Order ${key}: ${order.status}` , order });
    return res.json({ reply: 'Order not found. Would you like to create a support ticket?' });
  }

  // Quote intents
  if (/\b(card|visiting|invitation|a3|banner|brochure|flex|poster)\b/.test(text)) {
    const info = parseQuoteRequest(message);
    const quote = generateQuote({ product: info.product || 'visiting_cards', qty: info.qty || 100 });
    const lang = detectLanguage(message);
    const reply = translateResponse('I can generate an instant quote. Here is an approximate quote:', lang);
    return res.json({ reply, quote });
  }

  // Customer asked for categories/services explicitly
  if (/\b(categories|services|our service|our services|show categories)\b/.test(text)) {
    // Use local products.json to list available categories
    try {
      const cats = Array.from(new Set(products.map(p => p.category))).filter(Boolean);
      const lines = cats.map((c, i) => `${i+1}. ${c}`);
      return res.json({ reply: `📚 Available categories:\n\n${lines.join('\n')}\n\nReply with the category name or number to continue.` });
    } catch (_e) {
      return res.json({ reply: 'Sorry, could not load categories right now.' });
    }
  }

  // Product guidance
  if (/best paper|matte|glossy|outdoor|which banner|best paper for/i.test(text)) {
    if (/matte|glossy/.test(text)) {
      return res.json({ reply: 'Matte gives a subtle finish and hides reflections; glossy gives vibrant colors and sheen. For brochures matte is often more professional.' });
    }
    if (/outdoor|banner/.test(text)) {
      return res.json({ reply: 'Use PVC flex or vinyl for outdoor banners; use UV inks and thicker mesh/grommets for windy locations.' });
    }
    return res.json({ reply: 'Tell me the product (brochure, banner, visiting cards) and I can recommend materials.' });
  }

  // FAQ
  if (/timings|payment|lamination|gst|turnaround/i.test(text)) {
    if (/timing|open|hours/.test(text)) return res.json({ reply: FAQ.timings });
    if (/payment|pay/.test(text)) return res.json({ reply: FAQ.payment });
    if (/lamination/.test(text)) return res.json({ reply: FAQ.lamination });
    if (/gst/.test(text)) return res.json({ reply: FAQ.gst });
  }

  // Escalation / talk to designer
  if (/designer|talk to designer|live chat|whatsapp/.test(text)) {
    // Create a ticket and return WhatsApp link template
    const ticket = { id: `T-${Date.now()}`, message, created: new Date().toISOString(), status: 'open' };
    tickets.push(ticket);
    writeJson(TICKETS_FILE, tickets);
    const wa = `https://wa.me/?text=${encodeURIComponent('I need help with design. Ticket ID: ' + ticket.id)}`;
    return res.json({ reply: 'I created a support ticket and can open WhatsApp for you.', ticket, whatsapp: wa });
  }

  // Fallback
  res.json({ reply: "Sorry, I couldn't identify intent. I can help with quotes, product guidance, file checks and order tracking. Try: 'Need 500 visiting cards' or 'Check my file'" });
});

// File upload + basic checks
app.post('/upload', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'file required' });
  const filepath = req.file.path;
  const ext = path.extname(req.file.originalname).toLowerCase();

  try {
    if (['.png', '.jpg', '.jpeg', '.tiff'].includes(ext)) {
      const metadata = await sharp(filepath).metadata();
      const dpi = metadata.density || 72;
      const width = metadata.width || 0;
      const height = metadata.height || 0;
      const suggestions = [];
      if (Math.min(width, height) < 1000) suggestions.push('Low resolution detected');
      if (dpi < 300) suggestions.push('Recommended 300 DPI for print');
      if (suggestions.length === 0) suggestions.push('File looks print-ready (image).');
      return res.json({ file: req.file.originalname, width, height, dpi, suggestions });
    }

    if (ext === '.pdf') {
      const data = fs.readFileSync(filepath);
      const pdf = await PDFDocument.load(data);
      const pages = pdf.getPageCount();
      const sizes = pdf.getPages().map(p => p.getSize());
      return res.json({ file: req.file.originalname, pages, sizes, note: 'Basic PDF checks done. For font embedding and CMYK checks use a full preflight tool.' });
    }

    // Other vector/source formats
    if (['.cdr', '.ai', '.psd', '.eps'].includes(ext)) {
      return res.json({ file: req.file.originalname, note: 'Received source file. Automated checks limited for this type — recommend manual preflight or ask designer to verify fonts and layers.' });
    }

    res.json({ file: req.file.originalname, note: 'Unsupported file type for automated checks.' });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  } finally {
    // keep uploaded files for now; cleanup could be added
  }
});

// Product endpoints
app.get('/products', (req, res) => {
  res.json({ products });
});

app.get('/product/:key', (req, res) => {
  const key = req.params.key;
  const p = products.find(x => x.key === key || x.name.toLowerCase() === key.toLowerCase());
  if (!p) return res.status(404).json({ error: 'product not found' });
  res.json({ product: p });
});

// --- New features: multilingual support, proofreading, billing, visual search, transcribe placeholder

function detectLanguage(text) {
  // very simple keyword-based detection
  if (!text) return 'en';
  if (/[\u0D00-\u0D7F]/.test(text)) return 'ml'; // Malayalam unicode block
  if (/[\u0900-\u097F]|\b(नमस्ते|हैलो|क्या)\b/i.test(text)) return 'hi';
  // fallback english
  return 'en';
}

// Basic translation map for a few phrases (prototype)
const TRANSLATIONS = {
  hi: {
    'I can generate an instant quote. Here is an approximate quote:': 'मैं एक तत्काल कोट बना सकता हूँ। अनुमानित कोट यहाँ है:'
  },
  ml: {
    'I can generate an instant quote. Here is an approximate quote:': 'ഞാൻ ഒരു തൽസമയ ക്വോട്ട് സൃഷ്ടിക്കാം. ഏകദേശം വില ഇതാണ്:'
  }
};

function translateResponse(text, lang) {
  if (lang === 'en') return text;
  const map = TRANSLATIONS[lang];
  return (map && map[text]) || text;
}

app.post('/proofread', async (req, res) => {
  const { text, language } = req.body || {};
  if (!text) return res.status(400).json({ error: 'text required' });
  try {
    const params = new URLSearchParams();
    params.append('text', text);
    params.append('language', language || 'en-US');
    const r = await fetch('https://api.languagetool.org/v2/check', { method: 'POST', body: params });
    const data = await r.json();
    // return matches with simple summary
    const issues = (data.matches || []).map(m => ({ message: m.message, offset: m.offset, length: m.length, replacements: m.replacements.map(r=>r.value) }));
    // phone number check
    const phoneMatch = text.match(/\+?\d[\d\s-]{6,}\d/);
    const phoneIssues = phoneMatch ? [] : ['No phone number detected'];
    res.json({ issues, phoneIssues });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// Billing / invoices
const INVOICES_FILE = path.join(__dirname, 'invoices.json');
function readInvoices() { return readJson(INVOICES_FILE, []); }
function writeInvoices(v) { writeJson(INVOICES_FILE, v); }

app.post('/billing', (req, res) => {
  const { phone } = req.body || {};
  if (!phone) return res.status(400).json({ error: 'phone required' });
  const inv = readInvoices();
  const myInv = inv.filter(i => i.phone === phone);
  const pending = myInv.filter(i => !i.paid);
  const balance = pending.reduce((s, x) => s + (x.total || 0), 0);
  res.json({ invoices: myInv, pending, balance });
});

app.post('/billing/create', (req, res) => {
  const { phone, customerName, items } = req.body || {};
  if (!phone || !items || !Array.isArray(items)) return res.status(400).json({ error: 'phone and items[] required' });
  const subtotal = items.reduce((s, it) => s + (it.amount||0), 0);
  const gst = Number((subtotal * 0.18).toFixed(2));
  const total = Number((subtotal + gst).toFixed(2));
  const invoices = readInvoices();
  const invoice = { id: `INV-${Date.now()}`, phone, customerName, items, subtotal, gst, total, paid: false, created: new Date().toISOString() };
  invoices.push(invoice);
  writeInvoices(invoices);
  res.json({ invoice });
});

// Visual search (prototype): accept image and return placeholder similar items
app.post('/visual-search', upload.single('image'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'image required' });
  // Placeholder: in production integrate with feature-extractor + vector DB
  res.json({ queryImage: req.file.originalname, results: [], note: 'Prototype: integrate feature-extractor and vector DB for visual similarity.' });
});

// Transcription placeholder
app.post('/transcribe', upload.single('audio'), (req, res) => {
  // Clients can send a 'transcript' field if they already transcribed client-side.
  if (req.body && req.body.transcript) return res.json({ transcript: req.body.transcript });
  if (!req.file) return res.status(400).json({ error: 'audio file or transcript required' });
  res.status(501).json({ error: 'Transcription not implemented. Integrate an STT provider (Whisper/Cloud STT).' });
});

// Simple ticket creation endpoint
app.post('/ticket', (req, res) => {
  const { message } = req.body || {};
  if (!message) return res.status(400).json({ error: 'message required' });
  const ticket = { id: `T-${Date.now()}`, message, created: new Date().toISOString(), status: 'open' };
  tickets.push(ticket);
  writeJson(TICKETS_FILE, tickets);
  res.json({ ticket });
});

const PORT = process.env.PORT || 3800;
app.listen(PORT, () => console.log(`Chatbot service listening on port ${PORT}`));

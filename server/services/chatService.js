/**
 * Chat Service - Rule-Based Chatbot for Sarga Prints
 * 
 * Uses pattern matching to instantly match customer queries to predefined responses.
 * No external API dependency - 100% free and fast.
 * 
 * Features:
 * - 25+ predefined rules covering all Sarga services
 * - Instant response (< 100ms)
 * - Emoji-rich, friendly responses
 * - Graceful fallback for unmatched queries
 */

const websiteCache = require('./websiteCache');
const { callMLService } = require('../config/ml');

const RULES = [
  // ──────────────── TRACKING ────────────────
  {
    id: 'track_order',
    patterns: [
      /track|status|where is|where's|locate|find my order/i,
      /job code|order code|reference/i,
      /how long|how much time/i,
    ],
    response: "🔍 Please enter your registered mobile number or job code to track your order (e.g. PBA-20260527-001).",
    confidence: 0.95
  },

  // ──────────────── PRICING & QUOTES ────────────────
  {
    id: 'pricing',
    patterns: [
      /price|cost|rate|quote|estimate|how much|budget|rupees|₹/i,
      /charges|fee|expensive|cheap|affordable/i,
    ],
    response: "💰 **Get a Free Quote**\n\nPricing depends on:\n- Quantity\n- Paper type & quality\n- Printing method (offset vs. digital)\n- Finishing (lamination, binding, etc.)\n\n📋 Request a free custom quote:\n→ **sarga.in/contact**\n📧 **sargapba@gmail.com** (Perambra)\n📧 **sargaoffsetmpr@gmail.com** (Meppayur)",
    confidence: 0.95
  },

  // ──────────────── LOCATION & BRANCHES ────────────────
  {
    id: 'location',
    patterns: [
      /location|address|where|which branch|perambra|meppayur/i,
      /visit|come|go to|find us|nearby/i,
      /map|directions|reach|get to/i,
    ],
    response: "📍 **Our Locations**\n\n🏢 **Perambra** (Customer Hub)\n→ Main office & counter\n→ Order pickup point\n→ Quotation & design discussions\n\n🏭 **Meppayur** (Production Centre)\n→ Offset printing facility\n→ Large volume orders\n→ Bulk production\n\n**Both in Kozhikode District, Kerala** 🇮🇳\n\n📞 Open **Mon–Sat, 9AM–7PM IST**",
    confidence: 0.95
  },

  // ──────────────── CONTACT & PHONE ────────────────
  {
    id: 'contact',
    patterns: [
      /phone|call|whatsapp|contact|reach|email|message|text/i,
      /number|mobile|cell|landline/i,
    ],
    response: "📞 **Contact Sarga Prints**\n\n**📧 Email:**\n→ **sargapba@gmail.com** (Perambra)\n→ **sargaoffsetmpr@gmail.com** (Meppayur)\n\n**💬 WhatsApp:**\n→ **wa.me/+919496XXXXXX** (Perambra)\n\n**⏰ Hours:**\nMonday–Saturday, 9:00 AM – 7:00 PM IST\n(Closed Sundays & public holidays)\n\nWe respond within 24 hours! 😊",
    confidence: 0.95
  },

  // ──────────────── HOURS & TIMINGS ────────────────
  {
    id: 'hours',
    patterns: [
      /hours|open|close|timing|available|when|schedule|monday|tuesday|wednesday|thursday|friday|saturday|sunday/i,
      /how long are you open|working hours|business hours/i,
    ],
    response: "⏰ **Sarga Prints Hours**\n\n📅 **Monday – Saturday**\n🕘 **9:00 AM – 7:00 PM IST**\n\n🚫 **Closed:**\n→ Sundays\n→ Public holidays\n→ Festivals\n\n💡 **Tip:** Call or WhatsApp to confirm availability before visiting.",
    confidence: 0.95
  },

  // ──────────────── SERVICES - WEDDING CARDS ────────────────
  {
    id: 'wedding_cards',
    patterns: [
      /wedding|marriage|engagement|invitation|ceremony/i,
      /card|print|design|color/i,
    ],
    response: "💍 **Wedding Card Printing**\n\nWe specialize in **custom wedding card printing**:\n\n✨ **Options:**\n→ Offset printing (large volumes, best quality)\n→ Digital printing (quick turnaround)\n→ Custom design & layout\n→ Die-cutting (shaped cards)\n→ Lamination (matte or gloss finish)\n→ Embossing for premium feel\n\n📋 **Request a design consultation:**\n→ **sarga.in/contact**\n→ **sargapba@gmail.com**\n\nBring your ideas, we'll make them special! 💫",
    confidence: 0.95
  },

  // ──────────────── SERVICES - VISITING CARDS ────────────────
  {
    id: 'visiting_cards',
    patterns: [
      /visiting card|business card|namecard|professional card/i,
      /card|print/i,
    ],
    response: "🤝 **Visiting Card Printing**\n\n**Premium quality visiting cards** for professionals & businesses:\n\n✨ **Available in:**\n→ Full color (CMYK)\n→ Metallic & matte finishes\n→ Various paper weights (150-350 GSM)\n→ Standard & custom sizes\n→ Lamination options\n\n📋 Upload your design or request design help at:\n→ **sarga.in/contact**\n\nQuick turnaround, excellent quality! 🎯",
    confidence: 0.95
  },

  // ──────────────── SERVICES - OFFSET PRINTING ────────────────
  {
    id: 'offset_printing',
    patterns: [
      /offset|offset printing|large volume|bulk|book|brochure|magazine|letterhead|packaging/i,
    ],
    response: "📚 **Offset Printing** (Large Volumes)\n\n**Perfect for:**\n→ Books & booklets\n→ Brochures & catalogs\n→ Wedding cards (premium quality)\n→ Packaging & labels\n→ Letterheads\n→ Posters & banners\n→ Magazine printing\n\n**Why offset?**\n→ Best quality for large quantities\n→ Cost-effective (high volume)\n→ Full color support\n→ Professional finishes\n\n**Get a quote:**\n→ **sarga.in/contact**\n→ **sargapba@gmail.com**\n\n🏭 Printed at our Meppayur production centre",
    confidence: 0.95
  },

  // ──────────────── SERVICES - DIGITAL PRINTING ────────────────
  {
    id: 'digital_printing',
    patterns: [
      /digital|digital print|laser|short run|quick|rush/i,
    ],
    response: "⚡ **Digital & Laser Printing** (Quick Turnaround)\n\n**Perfect for:**\n→ Visiting cards\n→ ID cards & badges\n→ Certificates\n→ Labels & stickers\n→ Small runs (1-500 copies)\n→ Photostat/Xerox\n→ Quick prototypes\n\n**Why digital?**\n→ Fast delivery (1-2 days)\n→ Cost-effective for small quantities\n→ No setup time\n→ Good quality\n\n**Order now:**\n→ **sarga.in/contact**\n→ Walk-in at Perambra branch\n\n⚡ Ready when you are!",
    confidence: 0.95
  },

  // ──────────────── SERVICES - FLEX BANNERS ────────────────
  {
    id: 'flex_banners',
    patterns: [
      /flex|banner|flex banner|advertising|display|vinyl|outdoor/i,
    ],
    response: "🎨 **Flex Banner & Vinyl Printing**\n\n**Perfect for:**\n→ Advertising & promotions\n→ Shop displays\n→ Events & exhibitions\n→ Outdoor signage\n→ Backdrop prints\n→ Vehicle wraps\n\n**Available:**\n→ Various sizes\n→ Full color printing\n→ Weatherproof vinyl\n→ Custom design help\n\n📋 **Get a quote:**\n→ **sarga.in/contact**\n→ **sargapba@gmail.com**\n\nWe'll make your brand visible! 👀",
    confidence: 0.95
  },

  // ──────────────── SERVICES - BINDING ────────────────
  {
    id: 'binding',
    patterns: [
      /binding|bind|spiral|hard cover|hardbound|perfect bind|sewn/i,
      /book|report|document|thesis/i,
    ],
    response: "📖 **Binding Services**\n\n**We offer:**\n→ **Spiral binding** (open lay-flat books)\n→ **Hard binding** (books with hard covers)\n→ **Perfect binding** (magazines, brochures)\n→ **Sewn binding** (durable, premium)\n→ **Comb binding** (reports, documents)\n\n**Ideal for:**\n→ Books & thesis\n→ Reports & proposals\n→ Catalogs & manuals\n→ Training materials\n\n📋 Send your print files:\n→ **sarga.in/contact**\n\nWe'll bind them professionally! 📚",
    confidence: 0.95
  },

  // ──────────────── SERVICES - LAMINATION ────────────────
  {
    id: 'lamination',
    patterns: [
      /lamination|laminate|glossy|matte|matt|finish|protection/i,
    ],
    response: "✨ **Lamination Services**\n\n**Finishes available:**\n→ **Gloss lamination** (shiny, vibrant)\n→ **Matte lamination** (soft, professional)\n→ **Spot lamination** (partial coverage)\n→ **Thermal lamination** (quick)\n→ **Cold lamination** (delicate materials)\n\n**Benefits:**\n→ Protects from moisture & dust\n→ Increases durability\n→ Enhances color vibrancy\n→ Professional appearance\n\n**Used for:**\n→ Photos & certificates\n→ ID cards\n→ Visiting cards\n→ Posters\n→ Menus\n\n📋 **Order at:**\n→ **sarga.in/contact**\n\nMake it shine! ✨",
    confidence: 0.95
  },

  // ──────────────── SERVICES - DIE CUTTING ────────────────
  {
    id: 'die_cutting',
    patterns: [
      /die cut|die-cut|custom shape|cut|shaped|unusual shape|special shape/i,
    ],
    response: "✂️ **Die-Cutting Services**\n\n**Create custom shapes:**\n→ Heart-shaped cards\n→ Star patterns\n→ Logo-shaped designs\n→ Window cutouts\n→ Interlocking shapes\n→ Any custom shape you imagine\n\n**Used for:**\n→ Wedding cards\n→ Invitations\n→ Bookmarks\n→ Labels & stickers\n→ Marketing materials\n\n**Process:**\n→ Your design\n→ Custom die made\n→ Precision cutting\n→ Professional result\n\n📋 **Discuss your idea:**\n→ **sarga.in/contact**\n→ **sargapba@gmail.com**\n\nUnique shapes, unique impact! 🎯",
    confidence: 0.95
  },

  // ──────────────── SERVICES - PHOTO FRAMES & MEMENTOS ────────────────
  {
    id: 'photo_frames',
    patterns: [
      /photo frame|frame|memento|souvenir|gift|memory|keepsake/i,
    ],
    response: "🖼️ **Photo Frames & Mementos**\n\n**Preserve memories:**\n→ Custom photo frames\n→ Personalized mementos\n→ Gift items\n→ Corporate gifts\n→ Souvenir printing\n→ Photo printing (various sizes)\n\n**Perfect for:**\n→ Birthdays & anniversaries\n→ Corporate events\n→ Weddings\n→ Personal collections\n→ Office displays\n\n📋 **Create your memento:**\n→ **sarga.in/contact**\n→ Visit Perambra branch\n\nCapture moments, keep them forever! 📷",
    confidence: 0.95
  },

  // ──────────────── SERVICES - STICKERS & LABELS ────────────────
  {
    id: 'stickers',
    patterns: [
      /sticker|label|label print|sticky|seal|tag|adhesive/i,
    ],
    response: "🏷️ **Stickers & Labels**\n\n**Custom printing:**\n→ Product labels\n→ Logo stickers\n→ Warning labels\n→ Barcode labels\n→ Waterproof stickers\n→ Die-cut shapes\n\n**Available:**\n→ Various sizes\n→ Full color\n→ Matte or gloss finish\n→ Rolls or sheets\n→ Adhesive or non-adhesive\n\n**Uses:**\n→ Product branding\n→ Packaging\n→ Promotion\n→ Organization\n→ Decoration\n\n📋 **Order now:**\n→ **sarga.in/contact**\n→ **sargapba@gmail.com**\n\nStick it out! 🎨",
    confidence: 0.95
  },

  // ──────────────── SERVICES - RUBBER SEALS & STAMPS ────────────────
  {
    id: 'rubber_seals',
    patterns: [
      /rubber seal|stamp|seal|official|company stamp|rubber stamp/i,
    ],
    response: "🔖 **Rubber Seals & Stamps**\n\n**Custom made:**\n→ Company seals\n→ Name stamps\n→ Logo stamps\n→ Signature stamps\n→ Office stamps (paid, chq, etc.)\n→ Durable rubber\n\n**Perfect for:**\n→ Official documents\n→ Business correspondence\n→ Product authentication\n→ Office workflow\n→ Professional branding\n\n📋 **Get yours made:**\n→ **sarga.in/contact**\n→ Visit Perambra branch\n\nMake your mark! ✅",
    confidence: 0.95
  },

  // ──────────────── ABOUT SARGA ────────────────
  {
    id: 'about',
    patterns: [
      /about|sarga|who are you|company|history|experience|years|established|founded/i,
    ],
    response: "🏢 **About Sarga Prints**\n\n📖 **30+ Years of Excellence**\nSince 1994, Sarga Prints has been Kozhikode's trusted printing partner.\n\n**Two Branches:**\n→ **Perambra** — Customer hub, orders, design\n→ **Meppayur** — Offset production, large volumes\n\n**What we do:**\nOffset & digital printing, binding, lamination, die-cutting, banners, stamps, photo frames, and much more.\n\n**Why choose us:**\n→ 30+ years experience\n→ Professional quality\n→ Quick turnaround\n→ Competitive pricing\n→ Custom solutions\n→ Friendly team\n\n**Let's print something amazing together!** 🎨",
    confidence: 0.95
  },

  // ──────────────── SERVICES - LIST (dynamic categories) ────────────────
  {
    id: 'services_list',
    patterns: [
      /our service|our services|services\b|show services|show categories|categories\b/i,
    ],
    response: "Fetching available services...",
    confidence: 0.95
  },

  // ──────────────── CUSTOM DESIGN ────────────────
  {
    id: 'design',
    patterns: [
      /design|graphic|artwork|creative|art|designer|layout|format/i,
    ],
    response: "🎨 **Custom Design Services**\n\n**Do you have a designer?**\n→ You can upload your artwork (PDF, AI, PSD, PNG)\n\n**Don't have a design?**\n→ Our team can help! 🤝\n→ Discuss your ideas\n→ We'll create mockups\n→ You approve, we print\n\n**Files we accept:**\n→ PDF (preferred)\n→ Adobe files (AI, PSD)\n→ High-res images (PNG, JPG)\n→ Vector designs\n\n📋 **Upload or discuss:**\n→ **sarga.in/contact**\n→ **sargapba@gmail.com**\n\nLet's design together! ✨",
    confidence: 0.95
  },

  // ──────────────── DELIVERY & PICKUP ────────────────
  {
    id: 'delivery',
    patterns: [
      /delivery|ship|mail|pickup|collect|rush|urgent|express|how soon|how long/i,
    ],
    response: "🚚 **Delivery & Pickup**\n\n**Pickup Options:**\n→ At Perambra branch (Kozhikode)\n→ Free pickup within Kozhikode\n→ Doorstep delivery (extra charge)\n\n**Delivery Time:**\n→ Digital printing: 1-2 days\n→ Offset printing: 3-7 days\n→ Binding/special: 2-5 days\n→ **Express:** Ask for rush pricing\n\n📋 **Get exact timeline:**\n→ **sarga.in/contact**\n→ Call/WhatsApp during business hours\n→ Mention your order details\n\n⚡ We'll get it to you fast! 🎯",
    confidence: 0.95
  },

  // ──────────────── PAYMENT ────────────────
  {
    id: 'payment',
    patterns: [
      /payment|pay|price|cost|how much|fee|advance|credit|debit|upi|cash|card/i,
    ],
    response: "💳 **Payment Options**\n\n**We accept:**\n→ Cash (at branch)\n→ Bank transfer\n→ UPI (PhonePe, Google Pay, Paytm)\n→ Cheque\n→ Card payment (on inquiry)\n\n**Payment Process:**\n→ Quote provided first\n→ 50% advance for large orders\n→ Balance on delivery\n→ Or full upfront for small jobs\n\n📋 **Finalize payment:**\n→ **sargapba@gmail.com**\n→ Call to arrange\n→ Visit branch directly\n\n💰 Flexible payment, quality guaranteed! ✅",
    confidence: 0.95
  },

  // ──────────────── MINIMUM ORDER ────────────────
  {
    id: 'minimum',
    patterns: [
      /minimum|min|quantity|small order|how many|bulk/i,
    ],
    response: "📦 **Order Quantity**\n\n**Digital Printing:**\n→ **Minimum: 10-50 copies** (depends on item)\n→ Great for: Small runs, tests, urgent needs\n\n**Offset Printing:**\n→ **Minimum: 500 copies** (cost-effective)\n→ Great for: Large volumes, events, campaigns\n\n**Binding/Special:**\n→ **Minimum: Usually 1** (discuss with team)\n→ Great for: Unique items, photo frames, stamps\n\n📋 **Check if your quantity works:**\n→ **sarga.in/contact**\n→ **sargapba@gmail.com**\n\nWe'll find the best option for you! 🎯",
    confidence: 0.95
  },

  // ──────────────── REQUEST QUOTE (CTA) ────────────────
  {
    id: 'quote_cta',
    patterns: [
      /quote|inquiry|request|interested|want to|like to|thinking about/i,
    ],
    response: "📋 I can help generate a quote. Reply with a category name, or type 'categories' to see available services.",
    confidence: 0.95
  },

  // ──────────────── GENERAL GREETING ────────────────
  {
    id: 'greeting',
    patterns: [
      /^(hi|hello|hey|greetings|namaste)$/i,
    ],
    response: "👋 **Hi there!**\n\nWelcome to Sarga Prints! 🎨\n\nI'm here to help with:\n→ Printing services & options\n→ Order tracking\n→ Pricing & quotes\n→ Contact information\n→ Delivery details\n→ Any printing questions\n\n**What can I help you with today?** 😊",
    confidence: 0.95
  },
];

/**
 * Main orchestrator - matches user message against rules
 */
async function processMessage(message) {
  if (!message?.trim()) {
    return {
      text: "Please ask me something! For example:\n- 'How do I track my order?'\n- 'How much does printing cost?'\n- 'Do you offer wedding card printing?'\n- 'What are your hours?'",
      confidence: 0.0,
      source: 'fallback'
    };
  }

  // Try to match against rules
  // Handle simple numeric/category selections: if user sends a number or a category name,
  // show matching category's subcategories (helps interactive quote flow).
  const trimmed = message.trim();
  if (/^\d+$/.test(trimmed)) {
    try {
      const idx = Number(trimmed) - 1;
      const cats = await websiteCache.getCategories();
      if (idx >= 0 && idx < cats.length) {
        const cat = cats[idx];
        const subs = (cat.subcategories || []).map((s, i) => `${i+1}. ${s.name}`);
        const text = `📂 **${cat.name}**\n\nSubcategories:\n${subs.length ? subs.join('\n') : 'No subcategories available.'}\n\nReply with the subcategory name or number to see products.`;
        return { text, confidence: 0.9, source: 'rule', ruleId: 'category_select', subcategories: cat.subcategories || [], category: cat };
      }
    } catch (_e) {
      // fallthrough to normal rules
    }
  }

  // If user typed a category name directly, try to match and show its subcategories
  try {
    const catsForMatch = await websiteCache.getCategories();
    const foundCat = catsForMatch.find(c => String(c.name || '').toLowerCase() === trimmed.toLowerCase());
    if (foundCat) {
      const subs = (foundCat.subcategories || []).map((s, i) => `${i+1}. ${s.name}`);
      const text = `📂 **${foundCat.name}**\n\nSubcategories:\n${subs.length ? subs.join('\n') : 'No subcategories available.'}\n\nReply with the subcategory name or number to see products.`;
      return { text, confidence: 0.9, source: 'rule', ruleId: 'category_select', subcategories: foundCat.subcategories || [], category: foundCat };
    }
  } catch (_e) {
    // ignore
  }
  for (const rule of RULES) {
    for (const pattern of rule.patterns) {
      if (pattern.test(message)) {
        // Dynamic: return category list from website cache when services_list triggered
        if (rule.id === 'services_list') {
          try {
            const cats = await websiteCache.getCategories();
            const lines = cats.map((c, i) => `${i+1}. ${c.name}`);
            const text = `📚 **Our Services / Categories**\n\n${lines.join('\n')}\n\nReply with the category name or number to explore subcategories.`;
            return { text, confidence: rule.confidence, source: 'rule', ruleId: rule.id, categories: cats };
          } catch (_e) {
            return { text: 'Sorry, I could not load services right now. Please try again later.', confidence: 0.6, source: 'error', ruleId: rule.id };
          }
        }

        return {
          text: rule.response,
          confidence: rule.confidence,
          source: 'rule',
          ruleId: rule.id
        };
      }
    }
  }

  // Fallback if no match
  // Optional NLP/LLM fallback when enabled
  if (process.env.USE_NLP === '1') {
    try {
      const mlResp = await callMLService('/nlp/chat', { message });
      if (mlResp && !mlResp.fallback && mlResp.reply) {
        return { text: mlResp.reply, confidence: mlResp.confidence || 0.6, source: 'nlp' };
      }
    } catch (e) {
      // continue to rule-based fallback
      console.error('[ChatService] NLP call failed:', e.message || e);
    }
  }

  return {
    text: "I'm not quite sure about that, but our team can help! 😊\n\n**Reach out directly:**\n📧 **sargapba@gmail.com** (Perambra)\n📧 **sargaoffsetmpr@gmail.com** (Meppayur)\n💬 WhatsApp: **wa.me/+919496XXXXXX**\n⏰ **Mon–Sat, 9AM–7PM IST**\n\nWe'll get back to you within 24 hours! ✅",
    confidence: 0.5,
    source: 'fallback'
  };
}

module.exports = { processMessage };

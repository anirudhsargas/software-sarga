const { pool } = require('../database');
const logger = require('./logger');

const starterArticles = [
  {
    title: 'How to Choose the Perfect GSM for Wedding Cards',
    slug: 'how-to-choose-gsm-wedding-cards',
    excerpt: 'Confused between 220 GSM and 350 GSM paper weights? Read our ultimate guide on selecting the correct thickness, texture, and card stock for your premium wedding invitations.',
    category: 'Wedding Card Guides',
    tags: 'GSM, Wedding Cards, Paper Quality, Printing Guide',
    featured_image: '',
    seo_title: 'How to Choose GSM for Wedding Cards | Sarga Prints',
    seo_description: 'Discover how to choose the right GSM paper weight for your wedding cards. Expert advice on thickness, textures, and premium boards from Sarga Prints Kozhikode.',
    content: `
      <p>When it comes to printing your wedding invitations, one of the most critical decisions you will make is choosing the paper weight, measured in GSM (Grams per Square Meter). The thickness and feel of your wedding card set the tone for your special day. A flimsy card feels cheap, while a board that is too heavy might not fold properly without cracking.</p>
      
      <h2>What is GSM?</h2>
      <p>GSM stands for Grams per Square Meter. It is the universal standard for measuring paper thickness and density. The higher the GSM, the heavier and thicker the paper will be. For reference, standard photocopy paper is usually 70-80 GSM, whereas corporate visiting cards are printed on 300-350 GSM board.</p>

      <h2>Recommended GSM for Wedding Cards</h2>
      <ul>
        <li><strong>210 to 250 GSM (Light Cardstock):</strong> Best for inner leaflets, program schedules, and folding inserts. This weight slides easily into envelopes without creating bulk.</li>
        <li><strong>280 to 300 GSM (Medium Cardstock):</strong> The sweet spot for standard wedding cards. It offers a solid, high-quality feel and handles folds, texture printing, and metallic inks exceptionally well.</li>
        <li><strong>350 GSM and Above (Premium Heavy Board):</strong> Reserved for luxury, non-folding cards, backing boards, and foil-stamped main covers. It feels extremely premium and does not bend easily under pressure.</li>
      </ul>

      <h2>Choosing the Right Board Finish</h2>
      <p>GSM isn't the only factor; the paper type also matters. Metallic boards reflect light beautifully, whereas textured handmade boards offer a rustic, artisanal feel. At Sarga Prints Perambra & Meppayur, we recommend using a 300 GSM metallic or fine-textured board for invitations to achieve a sturdy, premium presence.</p>
    `
  },
  {
    title: 'Offset vs Digital Printing: Which is Right for You?',
    slug: 'offset-vs-digital-printing',
    excerpt: 'Should you use digital or offset printing for your project? Understand the difference in setup cost, turnaround time, turnaround quality, and volume discount sheets.',
    category: 'Offset Printing Tips',
    tags: 'Offset Printing, Digital Printing, Cost Comparison, Printing Tips',
    featured_image: '',
    seo_title: 'Offset vs Digital Printing: Cost & Quality Guide | Sarga',
    seo_description: 'Should you choose digital or offset printing? Learn the differences in quality, setup costs, turnaround times, and volume discounts at Sarga Prints Kozhikode.',
    content: `
      <p>Choosing between offset and digital printing can be confusing. Both offer unique benefits depending on your project size, budget, and urgency. Let's break down how these technologies work and which one you should choose for your next project at Sarga Prints.</p>

      <h2>1. Offset Printing: High-Volume Perfection</h2>
      <p>Offset printing is the traditional method utilizing metal plates, rubber rollers, and wet ink. It is highly cost-effective for large volumes because the per-unit cost decreases dramatically as the quantity increases.</p>
      <p><strong>Best for:</strong> Books, magazines, brochures, large-scale wedding invitations (500+ prints), and custom packaging.</p>
      <p><strong>Pros:</strong> Superior color accuracy, cheaper at high volumes, and supports premium finishes like Pantone spot colors.</p>
      <p><strong>Cons:</strong> High setup costs and longer turnaround times (usually 2-3 days minimum) due to plate creation.</p>

      <h2>2. Digital Printing: Fast & Flexible</h2>
      <p>Digital printing is the modern method that transfers digital files directly onto paper using dry toner or liquid ink (similar to a giant office laser printer). It has zero setup costs, making short-run prints highly affordable.</p>
      <p><strong>Best for:</strong> Fast photostats, institutional ID cards, urgent banners, personalized stickers, and small-batch menus (1 to 200 copies).</p>
      <p><strong>Pros:</strong> Near-instant turnaround (same day), zero setup cost, and supports variable data printing (printing different names on each invite/ID card).</p>
      <p><strong>Cons:</strong> Higher cost per page for massive volumes compared to offset.</p>

      <h2>The Verdict</h2>
      <p>For large-scale prints like 1,000 corporate brochures, go with <strong>Offset</strong>. If you need 50 customized visiting cards by tomorrow morning, choose <strong>Digital</strong>.</p>
    `
  },
  {
    title: 'Top 5 Premium Finishes for Luxury Wedding Cards',
    slug: 'best-wedding-card-finishes',
    excerpt: 'Make your invitations stand out! Explore foil stamping, embossing, spot UV, die-cutting, and edge gilding options that turn standard cards into premium keepsakes.',
    category: 'Wedding Card Guides',
    tags: 'Wedding Cards, Luxury Finish, Foil Stamping, Spot UV, Embossing',
    featured_image: '',
    seo_title: '5 Best Wedding Card Finishes & Styles | Sarga Prints',
    seo_description: 'Discover the best premium finishes for luxury wedding invitations, including gold foil, spot UV, embossing, and custom die-cuts at Sarga Prints Perambra.',
    content: `
      <p>Your wedding card is the very first glimpse your guests get of your wedding theme. To make a lasting impression, consider adding premium finishes to your cards. Here are the top 5 luxury card finishes offered at Sarga Prints to make your invitations look and feel extraordinary.</p>

      <h2>1. Hot Foil Stamping (Gold, Silver & Copper)</h2>
      <p>Foil stamping uses heat and pressure to transfer a metallic foil onto paper. It creates a brilliant reflective shine that catches the light beautifully. Gold and copper foils are currently the top choices in Kerala for traditional wedding cards.</p>

      <h2>2. Blind Embossing & Debossing</h2>
      <p>Embossing raises parts of the card to create a 3D texture, while debossing presses the design down into the paper. This finish is perfect for monograms, borders, or floral motifs on thick textured cards.</p>

      <h2>3. Spot UV (Glossy highlights)</h2>
      <p>Spot UV applies a clear, glossy liquid coating to specific parts of your design (like your name or a floral pattern) and cures it using ultraviolet light. It creates a beautiful contrast against a matte laminated background.</p>

      <h2>4. Custom Laser Die-Cutting</h2>
      <p>Die-cutting allows us to cut paper into intricate lace patterns, arched shapes, or fold-out flaps. Laser die-cutting allows for highly detailed filigree patterns that would be impossible with traditional manual dies.</p>

      <h2>5. Deckled & Gilded Edges</h2>
      <p>Edge gilding coats the sides of the paper stack with gold or silver paint. Combine this with handmade deckled (torn) edges for a vintage, royal-estate look.</p>
    `
  },
  {
    title: '7 Visiting Card Design Mistakes You Must Avoid',
    slug: 'visiting-card-design-mistakes',
    excerpt: 'Your business card is your brand shorthand. Avoid crowded text, low-resolution logos, poor contrast, wrong dimensions, and generic paper stocks.',
    category: 'Design Advice',
    tags: 'Business Cards, Visiting Cards, Design Mistakes, Branding',
    featured_image: '',
    seo_title: '7 Common Visiting Card Design Mistakes | Sarga Prints',
    seo_description: 'Avoid crucial business card errors. Learn why resolution, typography, paper selection, and layout size matter from Sarga Prints Kozhikode.',
    content: `
      <p>A visiting card is often a potential client's first physical point of contact with your brand. A poorly designed card gets thrown into the trash immediately. To ensure your business card works as a powerful marketing asset, avoid these 7 common design pitfalls.</p>

      <h2>1. Overcrowding Information</h2>
      <p>Do not try to list every single product or service you offer. Keep it clean: your name, designation, company logo, phone number, email, website, and a single address line are all you need.</p>

      <h2>2. Hard-to-Read Fonts</h2>
      <p>Fancy cursive or ultra-thin script fonts look elegant on screen but are incredibly difficult to read at small sizes. Choose clean, highly legible sans-serif fonts for details (sizes 7pt to 9pt).</p>

      <h2>3. Low-Resolution Graphics</h2>
      <p>Never download low-res logos from WhatsApp or Facebook for printing. Print files require high-resolution vector formats (.AI, .PDF, or .EPS) at a minimum of 300 DPI to avoid looking pixelated.</p>

      <h2>4. Choosing a Generic, Cheap Paper</h2>
      <p>Standard 220 GSM plain copier paper makes your business look amateur. Opt for at least 300-350 GSM premium cardstock with either a sleek matte lamination or a sophisticated velvet finish.</p>

      <h2>5. Forgetting Safe Zones and Bleed Lines</h2>
      <p>Always extend your background elements beyond the crop line by 2mm (bleed). Keep all text inside a 3mm safe margin. This prevents vital contact info from being sliced off during mass trimming.</p>
    `
  },
  {
    title: 'How Many Wedding Invitations Should You Actually Print?',
    slug: 'how-many-invitations-should-you-print',
    excerpt: 'Avoid overspending or running out of invites! Learn the mathematical formula to calculate invitation counts based on household count rather than head count.',
    category: 'Wedding Card Guides',
    tags: 'Wedding Cards, Printing Guide, Guest List, Budgeting',
    featured_image: '',
    seo_title: 'How Many Wedding Invitations Should I Print? | Sarga',
    seo_description: 'Calculate exactly how many wedding cards you need. Expert formula to save on invitation printing from Sarga Prints Perambra.',
    content: `
      <p>One of the most common mistakes couples make is ordering a wedding card for every individual guest on their list. This leads to wasting hundreds of printed cards, wasting thousands of rupees. Here is our simple guide on how to calculate your wedding card counts accurately.</p>

      <h2>The Household Rule (The Gold Standard)</h2>
      <p>Remember this simple rule: <strong>You print one invitation per household, not per guest.</strong> Couples, families, and housemates only need a single card. On average, this immediately cuts your guest count list by 40% to 50%!</p>

      <h2>The Invitation Estimation Formula</h2>
      <p>Here is a simple mathematical formula recommended by our desk team at Sarga Perambra:</p>
      <pre>Total Cards Needed = (Number of Households) + 15% (for last-minute additions & keepsakes)</pre>
      
      <h2>An Example</h2>
      <p>If your wedding guest list is 600 people, you will likely group them into roughly 300 households. Adding a 15% buffer (45 cards) gives you a total of <strong>345 cards</strong> to print. This is much cheaper than ordering 600 cards!</p>

      <h2>Why the Buffer is Important</h2>
      <p>Re-printing cards later in small volumes is extremely expensive. Set aside 15-20 cards for keepsakes (for yourself, parents, and close friends) and last-minute additions.</p>
    `
  },
  {
    title: 'Spot UV Coating vs Lamination: Which is Best for Covers?',
    slug: 'spot-uv-vs-lamination',
    excerpt: 'Make your report covers and flyers shine! Compare the glossy highlight of Spot UV against the heavy-duty protection of matte/gloss lamination.',
    category: 'Marketing Materials',
    tags: 'Spot UV, Lamination, Finishing, Marketing, Printing Quality',
    featured_image: '',
    seo_title: 'Spot UV vs Lamination: Ultimate Printing Finish Comparison',
    seo_description: 'Spot UV vs Lamination. Learn which finish is best for brochure covers, menu cards, and visiting cards at Sarga Prints Kozhikode.',
    content: `
      <p>Finishing layers protect your printed sheets from grease, water, and fingerprints while adding high-fidelity visual depth. Two of the most popular finishes are Lamination and Spot UV. Let's compare their durability, styling, and price points to help you choose the best fit.</p>

      <h2>What is Lamination?</h2>
      <p>Lamination seals paper inside a thin plastic film using heat and pressure. It adds full-page protection and structural strength.</p>
      <ul>
        <li><strong>Matte Lamination:</strong> Offers a smooth, non-reflective velvety finish that feels extremely premium and modern.</li>
        <li><strong>Gloss Lamination:</strong> Produces a glass-like reflective surface that makes colors pop and makes prints highly water-resistant.</li>
      </ul>

      <h2>What is Spot UV?</h2>
      <p>Spot UV is not a full-page layer. Instead, a glossy UV-cured varnish is applied only to selected areas (such as a logo, photo, or name) over a matte background. It creates a striking glossy-on-matte contrast that guest eyes will immediately gravitate to.</p>

      <h2>Comparison Table</h2>
      <table border="1" cellpadding="8" style="border-collapse: collapse; width: 100%; border: 1px solid var(--border)">
        <thead>
          <tr style="background: var(--surface-2)">
            <th>Feature</th>
            <th>Lamination</th>
            <th>Spot UV</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><strong>Protection</strong></td>
            <td>100% full-surface water & tear protection</td>
            <td>Decorative only (applied over laminated sheets)</td>
          </tr>
          <tr>
            <td><strong>Visual Appeal</strong></td>
            <td>Uniform matte or glossy look</td>
            <td>Dramatic gloss-on-matte contrast texture</td>
          </tr>
          <tr>
            <td><strong>Best For</strong></td>
            <td>Menus, folder covers, thesis, catalogs</td>
            <td>Premium visiting cards, book covers, invites</td>
          </tr>
          <tr>
            <td><strong>Durability</strong></td>
            <td>Extremely high (prevents folding cracks)</td>
            <td>High (scratches might show over time)</td>
          </tr>
        </tbody>
      </table>

      <h2>The Sarga Recommendation</h2>
      <p>For products that get handled heavily (like menu cards or university theses), use <strong>Matte Lamination</strong>. For luxury marketing brochures, combine both: apply a **Matte Lamination** baseline layer and add **Spot UV** to the logo for maximum impact.</p>
    `
  }
];

const seedBlog = async () => {
  try {
    // Check if posts exist
    const [rows] = await pool.query('SELECT COUNT(*) AS count FROM sarga_blog_posts');
    if (rows[0].count > 0) {
      logger.info('[Blog Seeder] Blog posts already exist. Skipping seed.');
      return;
    }

    logger.info('[Blog Seeder] Seeding 6 professional starter articles...');

    // Get the first author
    const [[author]] = await pool.query('SELECT id FROM sarga_blog_authors LIMIT 1');
    const authorId = author?.id || 1;

    for (const art of starterArticles) {
      await pool.query(
        `INSERT INTO sarga_blog_posts 
         (title, slug, excerpt, content, category, tags, author_id, status, read_time, seo_title, seo_description) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          art.title,
          art.slug,
          art.excerpt,
          art.content.trim(),
          art.category,
          art.tags,
          authorId,
          'Published',
          Math.max(2, Math.ceil(art.content.replace(/<[^>]*>/g, '').split(/\s+/).length / 200)),
          art.seo_title,
          art.seo_description
        ]
      );
    }

    logger.info('[Blog Seeder] Seeded 6 starter articles successfully.');
  } catch (err) {
    logger.error('[Blog Seeder] Migration seeding error:', err.message || err);
  }
};

module.exports = { seedBlog };

/**
 * MCP Tools — Website Integration (3 tools)
 *
 * Tools: get_available_services, create_website_inquiry, get_website_orders
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { selectAll, selectOne, insert } from '../services/db.js';
import { formatToolResult, parsePagination } from '../utils/formatters.js';

export function registerWebsiteTools(server: McpServer): void {

  // ─── 1. get_available_services ─────────────────────────
  server.tool(
    'get_available_services',
    'Get the catalog of services and products offered on the website',
    {},
    async () => {
      // Get categories
      const categories = await selectAll('SELECT id, name FROM sarga_product_categories WHERE is_active = TRUE ORDER BY position');

      // Get subcategories
      const subcategories = await selectAll('SELECT id, category_id, name FROM sarga_product_subcategories WHERE is_active = TRUE ORDER BY position');

      // Get products
      const products = await selectAll('SELECT id, subcategory_id, name, size, calculation_type, description FROM sarga_products WHERE is_active = TRUE');

      // Build hierarchy
      const catalog = (categories as any[]).map(cat => ({
        id: cat.id,
        name: cat.name,
        subcategories: (subcategories as any[])
          .filter(sub => sub.category_id === cat.id)
          .map(sub => ({
            id: sub.id,
            name: sub.name,
            products: (products as any[])
              .filter(prod => prod.subcategory_id === sub.id)
              .map(prod => ({
                id: prod.id,
                name: prod.name,
                size: prod.size,
                pricing_model: prod.calculation_type,
                description: prod.description,
              })),
          })),
      }));

      return {
        content: [{ type: 'text' as const, text: formatToolResult({ catalog }) }],
      };
    },
  );

  // ─── 2. create_website_inquiry ─────────────────────────
  server.tool(
    'create_website_inquiry',
    'Submit a new print job inquiry/order from the customer website',
    {
      customer_name: z.string().describe('Customer full name'),
      customer_email: z.string().email().optional(),
      customer_phone: z.string().describe('Customer mobile number'),
      product_type: z.string().describe('Type of product requested'),
      quantity: z.number().positive().optional().default(1),
      size: z.string().optional(),
      printing_side: z.enum(['single', 'double']).optional().default('single'),
      special_instructions: z.string().optional(),
      delivery_requirement: z.string().optional(),
    },
    async (args) => {
      // Generate a tracking token and order number
      const trackingToken = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
      const orderNumber = 'WEB-' + new Date().toISOString().split('T')[0].replace(/-/g, '').slice(2) + '-' + Math.floor(1000 + Math.random() * 9000);

      const id = await insert(
        `INSERT INTO sarga_artwork_uploads
           (order_number, customer_name, customer_email, customer_phone,
            product_type, quantity, size, printing_side,
            special_instructions, delivery_requirement, status, tracking_token)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'uploaded', ?)`,
        [orderNumber, args.customer_name, args.customer_email || null, args.customer_phone,
         args.product_type, args.quantity, args.size || null, args.printing_side,
         args.special_instructions || null, args.delivery_requirement || null, trackingToken],
      );

      return {
        content: [{
          type: 'text' as const,
          text: formatToolResult({
            success: true,
            inquiry_id: id,
            order_number: orderNumber,
            tracking_token: trackingToken,
            message: 'Inquiry successfully submitted. A staff member will review it shortly.',
          }),
        }],
      };
    },
  );

  // ─── 3. get_website_orders ─────────────────────────────
  server.tool(
    'get_website_orders',
    'List artwork uploads and inquiries submitted via the website',
    {
      status: z.enum(['uploaded', 'under_review', 'proof_sent', 'approved', 'printing', 'completed', 'cancelled', 'all']).optional().default('all'),
      page: z.number().optional().default(1),
      limit: z.number().optional().default(20),
    },
    async ({ status, page, limit }) => {
      const { page: p, limit: l, offset } = parsePagination(page, limit);

      let where = '';
      const params: unknown[] = [];

      if (status !== 'all') {
        where = 'WHERE status = ?';
        params.push(status);
      }

      const [orders, total] = await Promise.all([
        selectAll(
          `SELECT id, order_number, customer_name, customer_phone, product_type,
                  quantity, status, created_at
           FROM sarga_artwork_uploads
           ${where}
           ORDER BY created_at DESC LIMIT ? OFFSET ?`,
          [...params, l, offset],
        ),
        selectAll(`SELECT COUNT(*) as count FROM sarga_artwork_uploads ${where}`, params),
      ]);

      const totalCount = Number((total as any)[0]?.count || 0);

      return {
        content: [{
          type: 'text' as const,
          text: formatToolResult({
            orders,
            total: totalCount,
            page: p,
            limit: l,
            pages: Math.ceil(totalCount / l),
          }),
        }],
      };
    },
  );
}

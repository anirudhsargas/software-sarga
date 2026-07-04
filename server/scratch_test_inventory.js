const { pool } = require('./database');

async function testQuery() {
  try {
    const limit = 50;
    const offset = 0;
    const selectExtra = `, (SELECT COALESCE(SUM(quantity), 0) FROM sarga_branch_stock WHERE inventory_item_id = i.id) AS total_branch_stock`;
    const joinSection = '';
    const whereSection = ' WHERE i.is_deleted = 0';

    const countQuery = `SELECT COUNT(DISTINCT i.id) as total 
                     FROM sarga_inventory i 
                     LEFT JOIN sarga_products p ON i.id = p.inventory_item_id
                     LEFT JOIN sarga_product_subcategories ps ON p.subcategory_id = ps.id
                     ${joinSection}
                     ${whereSection}`;
    
    const dataQuery = `SELECT i.*, ANY_VALUE(p.id) as linked_product_id, ANY_VALUE(p.image_url) as product_image_url, ANY_VALUE(ps.name) as product_subcategory_name, ANY_VALUE(pc.name) as product_category_name, ANY_VALUE(spi.image_url) as cached_image_url, ANY_VALUE(spi.source) as image_source, ANY_VALUE(spi.confidence) as image_confidence, ANY_VALUE(spi.is_locked) as image_locked ${selectExtra}
                    FROM sarga_inventory i 
                    LEFT JOIN sarga_products p ON i.id = p.inventory_item_id
                    LEFT JOIN sarga_product_subcategories ps ON p.subcategory_id = ps.id
                    LEFT JOIN sarga_product_categories pc ON ps.category_id = pc.id
                    LEFT JOIN sarga_product_images spi ON i.id = spi.inventory_item_id
                    ${joinSection}
                    ${whereSection}
                    GROUP BY i.id
                    ORDER BY i.created_at DESC, i.id ASC
                    LIMIT ? OFFSET ?`;

    console.log('Running countQuery...');
    const [[{ total }]] = await pool.query(countQuery, []);
    console.log('total:', total);

    console.log('Running dataQuery...');
    const [rows] = await pool.query(dataQuery, [limit, offset]);
    console.log('Successfully fetched rows:', rows.length);
  } catch (err) {
    console.error('Error running query:', err);
  } finally {
    await pool.end();
  }
}

testQuery();

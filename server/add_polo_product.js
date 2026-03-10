const { pool } = require('./database');

async function addPoloShirtProduct() {
    try {
        const [existingProducts] = await pool.query(
            "SELECT * FROM sarga_inventory WHERE sku = ?",
            ['MYS-POLO-L']
        );

        if (existingProducts.length > 0) {
            console.log("✓ Product already exists:");
            console.log(JSON.stringify(existingProducts[0], null, 2));
            process.exit(0);
        }

        // Insert the POLO SHIRT product
        const result = await pool.query(
            `INSERT INTO sarga_inventory 
            (name, sku, category, unit, quantity, reorder_level, cost_price, sell_price, hsn, gst_rate) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                'VERIFICATION POLO SHIRT',      // name
                'MYS-POLO-L',                    // sku
                'Apparel',                       // category
                'pcs',                           // unit
                0,                               // initial quantity
                10,                              // reorder level
                0,                               // cost price (to be updated)
                200,                             // sell price (MRP: Rs. 200)
                '',                              // HSN code (if applicable)
                0                                // GST rate (to be updated)
            ]
        );

        console.log("✓ Product added successfully!");
        console.log(`✓ Product ID: ${result[0].insertId}`);
        console.log(`✓ SKU: MYS-POLO-L`);
        console.log(`✓ Name: VERIFICATION POLO SHIRT`);
        console.log(`✓ MRP: Rs. 200`);
        console.log("\nThe QR code should now work in the QR Diagnostic tool.");

        process.exit(0);
    } catch (err) {
        console.error("Error adding product:", err);
        process.exit(1);
    }
}

addPoloShirtProduct();

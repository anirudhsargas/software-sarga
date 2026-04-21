Paper inventory migration
========================

This script helps migrate existing paper-like rows from `sarga_inventory` into `sarga_paper_inventory`.

Usage
-----

From the repository root run:

```bash
node server/migrations/migrate_paper_inventory.js
```

To delete the original `sarga_inventory` rows after copying (destructive) add `--delete-originals`:

```bash
node server/migrations/migrate_paper_inventory.js --delete-originals
```

Notes
-----
- The script is conservative: it copies items and records a mapping in `sarga_inventory_to_paper_inventory`.
- It detects paper items by checking `category` for the substring `paper` and common aliases (offset/laser/other papers).
- Review the inserted values (sheets_per_packet, packets_in_stock) after running — manual adjustments may be required if your inventory tracks sheets vs packets differently.

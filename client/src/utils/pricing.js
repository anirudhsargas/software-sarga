/**
 * Shared pricing utility used by Billing.jsx and Customers.jsx.
 *
 * calculateProductPrice is a pure function — it takes product data and
 * returns { unit_price, total_amount, customPaperRate } without touching
 * component state.
 */

export const calculateProductPrice = ({
  product,
  quantity,
  extras = [],
  paperRateOverride,
  currentPaperRate = 0,
  isOffset = false,
  isDoubleSide = false
}) => {
  if (!product) return null;

  const qty = Number(quantity) || 0;
  let unit_price = 0;
  let total = 0;

  // For Slab type: track the effective slab so the double-side add-on uses
  // the correct row instead of always falling back to slabs[0].
  let slabForDS = null;

  const resolveUnitRate = (slab) => {
    const s = slab || product;
    if (!s) return 0;
    if (isDoubleSide && s.double_side_unit_rate !== undefined && s.double_side_unit_rate !== null && Number(s.double_side_unit_rate) > 0) {
      return Number(s.double_side_unit_rate) || 0;
    }
    if (isOffset && s.offset_unit_rate !== undefined && s.offset_unit_rate !== null && Number(s.offset_unit_rate) > 0) {
      return Number(s.offset_unit_rate) || 0;
    }
    const unitRate = Number(s.unit_rate || 0);
    if (unitRate > 0) return unitRate;
    const sellPrice = Number(s.sell_price || 0);
    if (sellPrice > 0) return sellPrice;
    const mrp = Number(s.mrp || 0);
    if (mrp > 0) return mrp;
    return 0;
  };

  if (product.calculation_type === 'Normal') {
    const slab = product.slabs && product.slabs.length > 0 ? product.slabs[0] : null;
    const rate = resolveUnitRate(slab);
    unit_price = rate;
    total = rate * qty;
  } else if (product.calculation_type === 'Slab') {
    const slabs = product.slabs || [];
    if (slabs.length > 0) {
      const sortedSlabs = [...slabs].sort((a, b) => Number(a.min_qty) - Number(b.min_qty));
      slabForDS = sortedSlabs[0];

      // Slabs are per-unit only if an explicit per-unit rate (unit_rate) is provided
      const firstSlab = sortedSlabs[0];
      const isPerUnitSlab =
        Number(firstSlab?.unit_rate) > 0 ||
        (Number(firstSlab?.min_qty) <= 1 && Number(firstSlab?.base_value) > 0 && Number(firstSlab?.base_value) < 15 && Number(firstSlab?.unit_rate || 0) > 0);

      if (isPerUnitSlab) {
        // Find highest slab where qty >= min_qty
        const matchingSlab =
          [...sortedSlabs].reverse().find((s) => qty >= Number(s.min_qty)) || sortedSlabs[0];
        slabForDS = matchingSlab;
        const rate = resolveUnitRate(matchingSlab);
        unit_price = rate;
        total = rate * qty;
      } else {
        const exactMatch = sortedSlabs.find((s) => Number(s.min_qty) === qty);
        if (exactMatch) {
          total = Number(exactMatch.base_value);
          slabForDS = exactMatch;
        } else if (qty < Number(sortedSlabs[0].min_qty)) {
          total = Number(sortedSlabs[0].base_value);
          slabForDS = sortedSlabs[0];
        } else if (qty > Number(sortedSlabs[sortedSlabs.length - 1].min_qty)) {
          const lastSlab = sortedSlabs[sortedSlabs.length - 1];
          const lastUnit = resolveUnitRate(lastSlab);
          if (lastUnit > 0) {
            total = lastUnit * qty;
          } else {
            // Derive per-unit rate from last slab's base_value / min_qty
            const lastSlabPerUnit = Number(lastSlab.min_qty) > 0 ? Number(lastSlab.base_value) / Number(lastSlab.min_qty) : 0;
            total = lastSlabPerUnit > 0 ? lastSlabPerUnit * qty : Number(lastSlab.base_value);
          }
          slabForDS = lastSlab;
        } else {
          for (let i = 0; i < sortedSlabs.length - 1; i++) {
            const s1 = sortedSlabs[i];
            const s2 = sortedSlabs[i + 1];
            if (qty > Number(s1.min_qty) && qty < Number(s2.min_qty)) {
              const ratio = (qty - Number(s1.min_qty)) / (Number(s2.min_qty) - Number(s1.min_qty));
              total = Number(s1.base_value) + ratio * (Number(s2.base_value) - Number(s1.base_value));
              slabForDS = s1;
              break;
            }
          }
        }
        // If Double Side is selected and the slab provides a double side rate, use it as flat batch amount (replaces single side base_value)
        if (isDoubleSide && slabForDS && Number(slabForDS.double_side_unit_rate) > 0) {
          total = Number(slabForDS.double_side_unit_rate);
        }
        unit_price = qty > 0 ? total / qty : 0;
      }
    }
  } else if (product.calculation_type === 'Range') {
    // Range-specific rate resolver: only use unit_rate (and double_side/offset variants).
    // base_value is a flat batch total for Slab type and must NOT be used as a per-unit rate here.
    const resolveRangeRate = (slab) => {
      const s = slab || product;
      if (!s) return 0;
      if (isDoubleSide && s.double_side_unit_rate !== undefined && s.double_side_unit_rate !== null && Number(s.double_side_unit_rate) > 0) {
        return Number(s.double_side_unit_rate) || 0;
      }
      if (isOffset && s.offset_unit_rate !== undefined && s.offset_unit_rate !== null && Number(s.offset_unit_rate) > 0) {
        return Number(s.offset_unit_rate) || 0;
      }
      return Number(s.unit_rate || 0);
    };

    const slabs = product.slabs || [];
    if (slabs.length > 0) {
      const sortedSlabs = [...slabs].sort((a, b) => Number(a.min_qty) - Number(b.min_qty));
      const matched = sortedSlabs.find((s) => {
        const maxQty =
          s.max_qty === null || s.max_qty === undefined || s.max_qty === ''
            ? Infinity
            : Number(s.max_qty);
        return qty >= Number(s.min_qty) && qty <= maxQty;
      });
      if (matched) {
        const rate = resolveRangeRate(matched);
        unit_price = rate;
        total = rate * qty;
      } else {
        // Qty is outside all defined ranges — use first slab for sub-min, last slab for overflow
        const fallbackSlab = qty < Number(sortedSlabs[0].min_qty)
          ? sortedSlabs[0]
          : sortedSlabs[sortedSlabs.length - 1];
        const rate = resolveRangeRate(fallbackSlab);
        unit_price = rate;
        total = rate * qty;
      }
    }
  }

  // Paper rate add-on (Slab type)
  const effectivePaperRate =
    paperRateOverride !== undefined
      ? Number(paperRateOverride)
      : currentPaperRate || 0;

  if (product.calculation_type === 'Slab' && (product.has_paper_rate || effectivePaperRate > 0)) {
    total += effectivePaperRate * qty;
    unit_price = qty > 0 ? total / qty : 0;
  }

  // Offset rate for flat batch slabs — REPLACES base total (flat batch amount, same concept as base_value)
  if (product.calculation_type === 'Slab' && isOffset) {
    const firstSlab = (product.slabs || [])[0];
    const isPerUnitSlab = Number(firstSlab?.unit_rate) > 0;
    if (!isPerUnitSlab) {
      const offsetRate = Number(slabForDS?.offset_unit_rate);
      if (offsetRate > 0) {
        // Offset rate is a flat batch amount — replaces the base slab total entirely
        total = offsetRate;
        // Re-add paper rate if applicable (paper rate is per-unit)
        if (product.has_paper_rate || effectivePaperRate > 0) {
          total += effectivePaperRate * qty;
        }
        unit_price = qty > 0 ? total / qty : 0;
      }
      // offsetRate === 0 → keep base total as-is (zero intentional, will be set later)
      // offsetRate undefined/null → handled in Billing.jsx with popup
    }
  }

  // Extras total
  const extrasTotal = (extras || []).reduce(
    (acc, curr) => acc + (Number(curr.amount) || 0),
    0
  );

  return {
    quantity: qty,
    unit_price,
    total_amount: total + extrasTotal,
    customPaperRate:
      paperRateOverride !== undefined ? Number(paperRateOverride) : currentPaperRate
  };
};

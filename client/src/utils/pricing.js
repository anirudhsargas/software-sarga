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

  const resolveUnitRate = (slab) => {
    if (!slab) return 0;
    if (isDoubleSide && slab.double_side_unit_rate !== undefined && slab.double_side_unit_rate !== null) {
      return Number(slab.double_side_unit_rate) || 0;
    }
    if (isOffset && slab.offset_unit_rate !== undefined && slab.offset_unit_rate !== null) {
      return Number(slab.offset_unit_rate) || 0;
    }
    return Number(slab.unit_rate) || 0;
  };

  if (product.calculation_type === 'Normal') {
    const slab = product.slabs && product.slabs.length > 0 ? product.slabs[0] : null;
    const rate = resolveUnitRate(slab);
    unit_price = rate;
    total = rate * qty;
  } else if (product.calculation_type === 'Slab') {
    const slabs = product.slabs || [];
    if (slabs.length > 0) {
      const sortedSlabs = [...slabs].sort((a, b) => a.min_qty - b.min_qty);
      const exactMatch = sortedSlabs.find((s) => Number(s.min_qty) === qty);
      if (exactMatch) {
        total = Number(exactMatch.base_value);
      } else if (qty < sortedSlabs[0].min_qty) {
        total = Number(sortedSlabs[0].base_value);
      } else if (qty > sortedSlabs[sortedSlabs.length - 1].min_qty) {
        const lastSlab = sortedSlabs[sortedSlabs.length - 1];
        const lastMin = Number(lastSlab.min_qty) || 0;
        const lastBase = Number(lastSlab.base_value) || 0;
        const lastUnit = lastMin > 0 ? lastBase / lastMin : 0;
        total = lastUnit * qty;
      } else {
        for (let i = 0; i < sortedSlabs.length - 1; i++) {
          const s1 = sortedSlabs[i];
          const s2 = sortedSlabs[i + 1];
          if (qty > s1.min_qty && qty < s2.min_qty) {
            const ratio = (qty - s1.min_qty) / (s2.min_qty - s1.min_qty);
            total = Number(s1.base_value) + ratio * (s2.base_value - s1.base_value);
            break;
          }
        }
      }
      unit_price = qty > 0 ? total / qty : 0;
    }
  } else if (product.calculation_type === 'Range') {
    const slabs = product.slabs || [];
    if (slabs.length > 0) {
      const sortedSlabs = [...slabs].sort((a, b) => a.min_qty - b.min_qty);
      const matched = sortedSlabs.find((s) => {
        const maxQty =
          s.max_qty === null || s.max_qty === undefined || s.max_qty === ''
            ? Infinity
            : Number(s.max_qty);
        return qty >= Number(s.min_qty) && qty <= maxQty;
      });
      if (matched) {
        const rate = resolveUnitRate(matched);
        unit_price = rate;
        total = rate * qty;
      } else {
        const lastSlab = sortedSlabs[sortedSlabs.length - 1];
        const maxQty =
          lastSlab?.max_qty === null || lastSlab?.max_qty === undefined || lastSlab?.max_qty === ''
            ? Infinity
            : Number(lastSlab.max_qty);
        if (qty > maxQty) {
          const rate = resolveUnitRate(lastSlab);
          unit_price = rate;
          total = rate * qty;
        }
      }
    }
  }

  // Paper rate add-on (Slab type only)
  const effectivePaperRate =
    paperRateOverride !== undefined
      ? Number(paperRateOverride)
      : currentPaperRate || 0;

  if (product.calculation_type === 'Slab' && product.has_paper_rate) {
    total += effectivePaperRate * qty;
    unit_price = qty > 0 ? total / qty : 0;
  }

  if (product.calculation_type === 'Slab' && product.has_double_side_rate && isDoubleSide) {
    const doubleSideRate = Number(product.slabs?.[0]?.double_side_unit_rate) || 0;
    if (doubleSideRate > 0) {
      total += doubleSideRate * qty;
      unit_price = qty > 0 ? total / qty : 0;
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

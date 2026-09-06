import { describe, it, expect } from 'vitest';
import { calculateProductPrice } from '../pricing';

describe('calculateProductPrice', () => {
  it('returns null for null product', () => {
    expect(calculateProductPrice({ product: null })).toBeNull();
  });

  it('calculates Normal type price', () => {
    const result = calculateProductPrice({
      product: {
        calculation_type: 'Normal',
        slabs: [{ unit_rate: 10 }],
      },
      quantity: 5,
    });

    expect(result.unit_price).toBe(10);
    expect(result.total_amount).toBe(50);
    expect(result.quantity).toBe(5);
  });

  it('handles Slab type with exact match', () => {
    const result = calculateProductPrice({
      product: {
        calculation_type: 'Slab',
        slabs: [
          { min_qty: 100, base_value: 500 },
          { min_qty: 500, base_value: 2000 },
        ],
      },
      quantity: 100,
    });

    expect(result.total_amount).toBe(500);
  });

  it('handles Slab type with interpolation', () => {
    const result = calculateProductPrice({
      product: {
        calculation_type: 'Slab',
        slabs: [
          { min_qty: 100, base_value: 500 },
          { min_qty: 500, base_value: 2000 },
        ],
      },
      quantity: 300,
    });

    expect(result.total_amount).toBeGreaterThan(500);
    expect(result.total_amount).toBeLessThan(2000);
  });

  it('handles Range type', () => {
    const result = calculateProductPrice({
      product: {
        calculation_type: 'Range',
        slabs: [
          { min_qty: 1, max_qty: 100, unit_rate: 10 },
          { min_qty: 101, max_qty: 500, unit_rate: 8 },
        ],
      },
      quantity: 50,
    });

    expect(result.unit_price).toBe(10);
    expect(result.total_amount).toBe(500);
  });

  it('does not fall back to base_value as unit_rate for Range type', () => {
    const result = calculateProductPrice({
      product: {
        calculation_type: 'Range',
        slabs: [
          { min_qty: 1, max_qty: 100, unit_rate: 0, base_value: 500 },
        ],
      },
      quantity: 50,
    });

    expect(result.unit_price).toBe(0);
    expect(result.total_amount).toBe(0);
  });

  it('handles double-side add-on for Slab type', () => {
    const result = calculateProductPrice({
      product: {
        calculation_type: 'Slab',
        has_double_side_rate: true,
        slabs: [
          { min_qty: 100, base_value: 500, double_side_unit_rate: 7 },
        ],
      },
      quantity: 100,
      isDoubleSide: true,
    });

    expect(result.total_amount).toBe(700);
  });

  it('handles paper rate add-on', () => {
    const result = calculateProductPrice({
      product: {
        calculation_type: 'Slab',
        has_paper_rate: true,
        slabs: [
          { min_qty: 100, base_value: 500 },
        ],
      },
      quantity: 100,
      currentPaperRate: 3,
    });

    expect(result.total_amount).toBe(800);
  });

  it('handles extras', () => {
    const result = calculateProductPrice({
      product: {
        calculation_type: 'Normal',
        slabs: [{ unit_rate: 10 }],
      },
      quantity: 5,
      extras: [{ amount: 25 }, { amount: 25 }],
    });

    expect(result.total_amount).toBe(100);
  });

  it('handles paper rate override', () => {
    const result = calculateProductPrice({
      product: {
        calculation_type: 'Slab',
        has_paper_rate: true,
        slabs: [
          { min_qty: 100, base_value: 500 },
        ],
      },
      quantity: 100,
      paperRateOverride: 5,
      currentPaperRate: 3,
    });

    expect(result.total_amount).toBe(1000);
  });

  it('handles offset unit rate', () => {
    const result = calculateProductPrice({
      product: {
        calculation_type: 'Range',
        slabs: [
          { min_qty: 1, max_qty: 100, unit_rate: 10, offset_unit_rate: 12 },
        ],
      },
      quantity: 50,
      isOffset: true,
    });

    expect(result.unit_price).toBe(12);
  });

  it('falls back to unit_rate if offset_unit_rate is 0 or null', () => {
    const result = calculateProductPrice({
      product: {
        calculation_type: 'Range',
        slabs: [
          { min_qty: 1, max_qty: 100, unit_rate: 10, offset_unit_rate: 0 },
        ],
      },
      quantity: 50,
      isOffset: true,
    });

    expect(result.unit_price).toBe(10);
  });

  it('handles offset rate for Slab type', () => {
    const result = calculateProductPrice({
      product: {
        calculation_type: 'Slab',
        slabs: [
          { min_qty: 100, base_value: 500, offset_unit_rate: 1.5 },
        ],
      },
      quantity: 100,
      isOffset: true,
    });

    expect(result.total_amount).toBe(650);
  });

  it('returns 0 total for zero quantity', () => {
    const result = calculateProductPrice({
      product: {
        calculation_type: 'Normal',
        slabs: [{ unit_rate: 10 }],
      },
      quantity: 0,
    });

    expect(result.total_amount).toBe(0);
  });

  it('calculates flat batch slab with paper rate correctly (e.g. 750 printing + 500 paper = 1250)', () => {
    const result = calculateProductPrice({
      product: {
        calculation_type: 'Slab',
        has_paper_rate: true,
        has_double_side_rate: true,
        slabs: [
          { min_qty: 1000, base_value: 750, unit_rate: 0 },
        ],
      },
      quantity: 1000,
      currentPaperRate: 0.5,
      isOffset: true,
    });

    expect(result.unit_price).toBe(1.25);
    expect(result.total_amount).toBe(1250);
  });

  it('calculates flat batch slab with double side flat batch rate correctly (e.g. 1500 double side + 500 paper = 2000)', () => {
    const result = calculateProductPrice({
      product: {
        calculation_type: 'Slab',
        has_paper_rate: true,
        has_double_side_rate: true,
        slabs: [
          { min_qty: 1000, base_value: 750, double_side_unit_rate: 1500, unit_rate: 0 },
        ],
      },
      quantity: 1000,
      currentPaperRate: 0.5,
      isDoubleSide: true,
    });

    expect(result.unit_price).toBe(2.00);
    expect(result.total_amount).toBe(2000);
  });
});

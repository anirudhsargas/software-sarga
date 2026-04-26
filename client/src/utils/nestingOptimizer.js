/**
 * Nesting Optimizer for Plate Management
 * 
 * Calculates optimal placement of different-sized items on a plate
 * to minimize waste using bin packing algorithms.
 */

import { PAPER_SIZES } from './paperOptimizer';

// Material types with their properties
export const MATERIAL_TYPES = {
  'paper': { label: 'Paper', density: 0.08, unit: 'gsm' },
  'card': { label: 'Card', density: 0.15, unit: 'gsm' },
  'board': { label: 'Board', density: 0.25, unit: 'gsm' },
  'vinyl': { label: 'Vinyl', density: 0.12, unit: 'gsm' },
};

/**
 * Rectangle packing using Bottom-Left algorithm with rotation support
 */
class RectanglePacker {
  constructor(plateWidth, plateHeight) {
    this.plateWidth = plateWidth;
    this.plateHeight = plateHeight;
    this.placedRects = [];
  }

  /**
   * Try to place a rectangle at the best possible position
   */
  tryPlace(width, height, allowRotation = true) {
    const positions = this.generateCandidatePositions(width, height, allowRotation);
    
    for (const pos of positions) {
      if (this.canPlace(pos.x, pos.y, pos.width, pos.height)) {
        this.placedRects.push({
          x: pos.x,
          y: pos.y,
          width: pos.width,
          height: pos.height,
          rotated: pos.rotated
        });
        return { x: pos.x, y: pos.y, width: pos.width, height: pos.height, rotated: pos.rotated };
      }
    }
    
    return null;
  }

  /**
   * Generate candidate positions for placement
   */
  generateCandidatePositions(width, height, allowRotation) {
    const positions = [];
    
    // Try both orientations if allowed
    const orientations = allowRotation 
      ? [{ w: width, h: height, rotated: false }, { w: height, h: width, rotated: true }]
      : [{ w: width, h: height, rotated: false }];

    for (const orient of orientations) {
      // Bottom-left corner
      positions.push({ x: 0, y: 0, width: orient.w, height: orient.h, rotated: orient.rotated });
      
      // Try positions adjacent to existing rectangles
      for (const rect of this.placedRects) {
        // Position to the right of existing rect
        positions.push({ 
          x: rect.x + rect.width, 
          y: rect.y, 
          width: orient.w, 
          height: orient.h, 
          rotated: orient.rotated 
        });
        
        // Position above existing rect
        positions.push({ 
          x: rect.x, 
          y: rect.y + rect.height, 
          width: orient.w, 
          height: orient.h, 
          rotated: orient.rotated 
        });
        
        // Position at top-right corner of existing rect
        positions.push({ 
          x: rect.x + rect.width, 
          y: rect.y + rect.height, 
          width: orient.w, 
          height: orient.h, 
          rotated: orient.rotated 
        });
      }
    }

    // Sort positions by distance from origin (bottom-left first)
    return positions.sort((a, b) => {
      const distA = a.x + a.y;
      const distB = b.x + b.y;
      return distA - distB;
    });
  }

  /**
   * Check if a rectangle can be placed at given position without overlap
   */
  canPlace(x, y, width, height) {
    // Check if within plate bounds
    if (x + width > this.plateWidth || y + height > this.plateHeight) {
      return false;
    }

    // Check for overlap with existing rectangles
    for (const rect of this.placedRects) {
      if (this.overlaps(x, y, width, height, rect.x, rect.y, rect.width, rect.height)) {
        return false;
      }
    }

    return true;
  }

  /**
   * Check if two rectangles overlap
   */
  overlaps(x1, y1, w1, h1, x2, y2, w2, h2) {
    return !(x1 + w1 <= x2 || x2 + w2 <= x1 || y1 + h1 <= y2 || y2 + h2 <= y1);
  }

  /**
   * Calculate total used area
   */
  getUsedArea() {
    return this.placedRects.reduce((sum, rect) => sum + (rect.width * rect.height), 0);
  }

  /**
   * Get waste percentage
   */
  getWastePercentage() {
    const totalArea = this.plateWidth * this.plateHeight;
    const usedArea = this.getUsedArea();
    return ((totalArea - usedArea) / totalArea) * 100;
  }
}

/**
 * Optimize placement of multiple items on a plate
 * Uses greedy algorithm with sorting by area (largest first)
 */
export function optimizePlateLayout({
  plateWidth,
  plateHeight,
  items,
  allowRotation = true,
  gutter = 0
}) {
  const effectiveWidth = plateWidth - gutter * 2;
  const effectiveHeight = plateHeight - gutter * 2;
  
  // Sort items by area (largest first) for better packing
  const sortedItems = [...items].sort((a, b) => {
    const areaA = a.width * a.height;
    const areaB = b.width * b.height;
    return areaB - areaA;
  });

  const packer = new RectanglePacker(effectiveWidth, effectiveHeight);
  const placedItems = [];
  const failedItems = [];

  for (const item of sortedItems) {
    const result = packer.tryPlace(item.width, item.height, allowRotation);
    
    if (result) {
      placedItems.push({
        ...item,
        x: result.x + gutter,
        y: result.y + gutter,
        placedWidth: result.width,
        placedHeight: result.height,
        rotated: result.rotated
      });
    } else {
      failedItems.push(item);
    }
  }

  const totalPlateArea = plateWidth * plateHeight;
  const usedArea = packer.getUsedArea();
  const wasteArea = totalPlateArea - usedArea;
  const wastePercent = (wasteArea / totalPlateArea) * 100;
  const utilizationPercent = 100 - wastePercent;

  return {
    placedItems,
    failedItems,
    totalPlateArea,
    usedArea,
    wasteArea,
    wastePercent: Math.round(wastePercent * 10) / 10,
    utilizationPercent: Math.round(utilizationPercent * 10) / 10,
    itemCount: placedItems.length,
    failedCount: failedItems.length
  };
}

/**
 * Find best plate size for given items
 */
export function findBestPlateSize({
  items,
  allowRotation = true,
  gutter = 0,
  preferredSizes = ['SRA3', 'SRA2', 'SRA1', 'A3', 'A2', 'A1']
}) {
  const results = [];

  for (const sizeName of preferredSizes) {
    const size = PAPER_SIZES[sizeName];
    if (!size) continue;

    const result = optimizePlateLayout({
      plateWidth: size.w,
      plateHeight: size.h,
      items,
      allowRotation,
      gutter
    });

    results.push({
      sizeName,
      label: size.label,
      width: size.w,
      height: size.h,
      ...result
    });
  }

  // Sort by utilization (highest first) and then by failed items (lowest first)
  return results.sort((a, b) => {
    if (a.failedCount !== b.failedCount) {
      return a.failedCount - b.failedCount;
    }
    return b.utilizationPercent - a.utilizationPercent;
  });
}

/**
 * Check if an item can fit on a plate
 */
export function canItemFitOnPlate(itemWidth, itemHeight, plateWidth, plateHeight, allowRotation = true) {
  const fitsNormal = itemWidth <= plateWidth && itemHeight <= plateHeight;
  const fitsRotated = allowRotation && itemHeight <= plateWidth && itemWidth <= plateHeight;
  return fitsNormal || fitsRotated;
}

/**
 * Get items that can fit on a plate
 */
export function getFittingItems(items, plateWidth, plateHeight, allowRotation = true) {
  return items.filter(item => 
    canItemFitOnPlate(item.width, item.height, plateWidth, plateHeight, allowRotation)
  );
}

export const PRODUCT_TYPES = [
  {
    id: 'visiting-card',
    name: 'Visiting Card',
    icon: 'CreditCard',
    width: 3.5,
    height: 2,
    unit: 'in',
    bleed: 0.125,
    safeMargin: 0.125,
    dpi: 300,
    description: 'Standard business card — 3.5 × 2 inches',
    preview: null,
  },
  {
    id: 'wedding-card',
    name: 'Wedding Card',
    icon: 'Heart',
    width: 7,
    height: 5,
    unit: 'in',
    bleed: 0.125,
    safeMargin: 0.25,
    dpi: 300,
    description: 'Standard wedding invitation card',
    preview: null,
  },
  {
    id: 'flex-banner',
    name: 'Flex Banner',
    icon: 'Flag',
    width: 48,
    height: 30,
    unit: 'in',
    bleed: 0.25,
    safeMargin: 0.5,
    dpi: 150,
    description: 'Large format flex banner',
    preview: null,
  },
  {
    id: 'poster',
    name: 'Poster',
    icon: 'Image',
    width: 18,
    height: 24,
    unit: 'in',
    bleed: 0.125,
    safeMargin: 0.25,
    dpi: 300,
    description: 'Standard poster — 18 × 24 inches',
    preview: null,
  },
  {
    id: 'id-card',
    name: 'ID Card',
    icon: 'IdCard',
    width: 3.375,
    height: 2.125,
    unit: 'in',
    bleed: 0.0625,
    safeMargin: 0.125,
    dpi: 300,
    description: 'CR-80 standard ID card',
    preview: null,
  },
  {
    id: 'photo-frame',
    name: 'Photo Frame',
    icon: 'Frame',
    width: 8,
    height: 10,
    unit: 'in',
    bleed: 0,
    safeMargin: 0,
    dpi: 300,
    description: 'Standard photo print — 8 × 10 inches',
    preview: null,
  },
  {
    id: 'memento',
    name: 'Memento',
    icon: 'Award',
    width: 12,
    height: 8,
    unit: 'in',
    bleed: 0.125,
    safeMargin: 0.25,
    dpi: 300,
    description: 'Custom memento / certificate',
    preview: null,
  },
];

export function findProduct(id) {
  return PRODUCT_TYPES.find((p) => p.id === id);
}

export function getCanvasDimensions(product, zoom = 1) {
  const scale = 40 * zoom;
  return {
    width: product.width * scale,
    height: product.height * scale,
    scale,
    bleedPx: product.bleed * scale,
    safePx: product.safeMargin * scale,
    actualWidthMm: product.width * 25.4,
    actualHeightMm: product.height * 25.4,
  };
}

export const FONTS = [
  'Arial', 'Helvetica', 'Times New Roman', 'Georgia', 'Courier New',
  'Verdana', 'Trebuchet MS', 'Impact', 'Comic Sans MS', 'Palatino',
  'Garamond', 'Bookman', 'Tahoma', 'Lucida Console',
];

export const FONT_SIZES = [8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 32, 36, 42, 48, 54, 60, 66, 72];

export const SHAPES = ['rect', 'circle', 'triangle', 'line', 'polygon', 'star'];

export const CANVAS_COLORS = {
  light: '#f0f0f0',
  dark: '#1a1a2e',
};

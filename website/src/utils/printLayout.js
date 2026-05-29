export const SHEET_PRESETS = {
  '13x19': { label: '13×19 inch', width: 13, height: 19, safeWidth: 12, safeHeight: 18, bleed: 0.125 },
};

export const PHOTO_PRESETS = [
  { label: '6×8 inch', width: 6, height: 8 },
  { label: '5×7 inch', width: 5, height: 7 },
  { label: '4×6 inch', width: 4, height: 6 },
  { label: '4×4 inch (Square)', width: 4, height: 4 },
  { label: 'Passport (2×2)', width: 2, height: 2 },
  { label: 'Polaroid (3.5×4.25)', width: 3.5, height: 4.25 },
  { label: '2× A4', width: 11.69, height: 16.53, layout: '2xA4' },
];

export const INCH_TO_PX = (inches, dpi = 300) => Math.round(inches * dpi);

export function autoArrangePhotos(photos, sheetW, sheetH, margin = 0.5, spacing = 0.25) {
  if (!photos.length) return photos;

  const maxContentW = sheetW - margin * 2;
  const maxContentH = sheetH - margin * 2;

  const placed = photos.map((p, i) => {
    const aspect = p.width / p.height;
    let pw, ph;

    if (p.width > maxContentW) {
      pw = maxContentW;
      ph = pw / aspect;
    } else {
      pw = p.width;
      ph = p.height;
    }

    if (ph > maxContentH) {
      ph = maxContentH;
      pw = ph * aspect;
    }

    let x = margin, y = margin;

    if (i === 0) {
      x = margin + (maxContentW - pw) / 2;
      y = margin + (maxContentH - ph) / 2;
    } else {
      const prev = photos[i - 1];
      y = margin + (maxContentH - ph) / 2;
      x = margin + (maxContentW - pw) / 2;
    }

    return { ...p, x, y, width: pw, height: ph, rotation: 0 };
  });

  return placed;
}

export function smartPack(photos, sheetW, sheetH, margin = 0.5, spacing = 0.15) {
  if (!photos.length) return photos;

  const placed = [];
  const usedW = sheetW - margin * 2;
  const usedH = sheetH - margin * 2;

  let cursorX = margin;
  let cursorY = margin;
  let rowH = 0;

  for (const p of photos) {
    const aspect = p.width / p.height;
    let pw, ph;

    if (p.width > usedW) {
      pw = usedW;
      ph = pw / aspect;
    } else {
      pw = p.width;
      ph = p.height;
    }

    if (ph > usedH * 0.8) {
      ph = usedH * 0.8;
      pw = ph * aspect;
    }

    if (cursorX + pw > margin + usedW) {
      cursorX = margin;
      cursorY += rowH + spacing;
      rowH = 0;
    }

    if (cursorY + ph > margin + usedH) break;

    placed.push({ ...p, x: cursorX, y: cursorY, width: pw, height: ph, rotation: 0 });
    cursorX += pw + spacing;
    rowH = Math.max(rowH, ph);
  }

  const totalHeight = placed.length > 0
    ? Math.max(...placed.map(p => p.y + p.height)) - Math.min(...placed.map(p => p.y)) + margin
    : 0;

  return { items: placed, totalHeight };
}

export function renderToCanvas(photos, sheetW, sheetH, dpi = 300, bgColor = '#ffffff') {
  const pxW = INCH_TO_PX(sheetW, dpi);
  const pxH = INCH_TO_PX(sheetH, dpi);

  const canvas = document.createElement('canvas');
  canvas.width = pxW;
  canvas.height = pxH;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = bgColor;
  ctx.fillRect(0, 0, pxW, pxH);

  const promises = photos.map(p => {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const dx = INCH_TO_PX(p.x, dpi);
        const dy = INCH_TO_PX(p.y, dpi);
        const dw = INCH_TO_PX(p.width, dpi);
        const dh = INCH_TO_PX(p.height, dpi);

        ctx.save();
        if (p.rotation) {
          const cx = dx + dw / 2;
          const cy = dy + dh / 2;
          ctx.translate(cx, cy);
          ctx.rotate((p.rotation * Math.PI) / 180);
          ctx.translate(-cx, -cy);
        }

        if (p.crop) {
          const sx = p.crop.x * img.naturalWidth;
          const sy = p.crop.y * img.naturalHeight;
          const sw = p.crop.width * img.naturalWidth;
          const sh = p.crop.height * img.naturalHeight;
          ctx.drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh);
        } else {
          ctx.drawImage(img, dx, dy, dw, dh);
        }

        ctx.restore();
        resolve();
      };
      img.onerror = resolve;
      img.src = p.src;
    });
  });

  return Promise.all(promises).then(() => canvas);
}

export async function exportPDF(photos, sheetW, sheetH, fileName = 'print-sheet', dpi = 300, format = 'pdf') {
  const { jsPDF } = await import('jspdf');

  const canvas = await renderToCanvas(photos, sheetW, sheetH, dpi);
  const imgData = canvas.toDataURL('image/jpeg', 0.95);
  const mmW = sheetW * 25.4;
  const mmH = sheetH * 25.4;

  const pdf = new jsPDF({
    orientation: mmW > mmH ? 'landscape' : 'portrait',
    unit: 'mm',
    format: [mmW, mmH],
  });

  pdf.addImage(imgData, 'JPEG', 0, 0, mmW, mmH, undefined, 'FAST');
  pdf.save(`${fileName}.pdf`);
}

export function downloadImage(canvas, fileName = 'print-sheet', format = 'png') {
  const mime = format === 'jpeg' ? 'image/jpeg' : 'image/png';
  const ext = format === 'jpeg' ? 'jpg' : 'png';
  const link = document.createElement('a');
  link.download = `${fileName}.${ext}`;
  link.href = canvas.toDataURL(mime, 0.95);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

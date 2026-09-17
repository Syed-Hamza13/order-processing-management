// Real physical page sizes in millimetres, converted to pixels at 96 DPI for on-screen design.
// Actual physical accuracy on the printed page depends on the printer/browser using the same
// "100% scale, no fit-to-page" print setting — this is called out in the README.
export const MM_TO_PX = 96 / 25.4;

export const PAGE_SIZES_MM = {
  A3: { w: 297, h: 420 },
  A4: { w: 210, h: 297 },
  A5: { w: 148, h: 210 },
  LETTER: { w: 215.9, h: 279.4 },
  ENVELOPE: { w: 110, h: 220 }, // DL envelope — adjust in the editor if your office uses a different envelope size
};

// Single source of truth for a page size + orientation's REAL mm dimensions.
// Both the design canvas (px) and the print layout (mm) now derive from this same function,
// so they can never drift apart or disagree on aspect ratio.
export function getPageMm(pageSize, orientation) {
  const key = String(pageSize || '').toUpperCase().trim(); 
  const mm = PAGE_SIZES_MM[key];
  if (!mm) {
    // eslint-disable-next-line no-console
    console.warn(`[pageSizes] Unknown page size "${pageSize}" — falling back to A4. Check what's actually saved on this template.`);
  }
  const base = mm || PAGE_SIZES_MM.A4;
  let w = base.w;
  let h = base.h;
  if (orientation === 'landscape' && h > w) { const t = w; w = h; h = t; }
  if (orientation === 'portrait' && w > h) { const t = w; w = h; h = t; }
  return { w, h };
}

export function getCanvasDimensions(pageSize, orientation) {
  const { w, h } = getPageMm(pageSize, orientation);
  return {
    width: Math.round(w * MM_TO_PX),
    height: Math.round(h * MM_TO_PX),
  };
}

export const PAGE_SIZE_OPTIONS = ['A3', 'A4', 'A5', 'LETTER', 'ENVELOPE']; 
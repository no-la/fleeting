// Rasterize native emoji at a moderate size before smooth enlargement.
const RASTER_SIZE = 160;
const EMOJI_FONT = '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';
const cache = new Map();
const segments = new Intl.Segmenter("ja", { granularity: "grapheme" });

export function isEmoji(text) {
  if (text.includes("\ufe0e") || [...segments.segment(text)].length !== 1) return false;
  return /[\p{Extended_Pictographic}\p{Regional_Indicator}\p{Emoji_Modifier}\u20e3]/u.test(text);
}

export function emojiImage(text) {
  if (!isEmoji(text)) return null;
  if (!cache.has(text)) {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    const configure = () => {
      ctx.font = RASTER_SIZE + "px " + EMOJI_FONT;
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
    };
    configure();
    const metrics = ctx.measureText(text);
    const left = Math.ceil(metrics.actualBoundingBoxLeft) + 2;
    const top = Math.ceil(metrics.actualBoundingBoxAscent) + 2;
    canvas.width = Math.max(1, left + Math.ceil(metrics.actualBoundingBoxRight) + 2);
    canvas.height = Math.max(1, top + Math.ceil(metrics.actualBoundingBoxDescent) + 2);
    configure();
    ctx.fillText(text, left, top);
    if (cache.size >= 128) cache.delete(cache.keys().next().value);
    cache.set(text, { canvas, x: -left, y: -top, size: RASTER_SIZE });
  }
  return cache.get(text);
}

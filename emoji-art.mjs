import { assets } from "./emoji-assets.mjs";

const cache = new Map();
const segments = new Intl.Segmenter("ja", { granularity: "grapheme" });

export function emojiAsset(text) {
  // Preserve explicit text presentation and ordinary numbers/punctuation.
  if (text.includes("\ufe0e")) return null;
  const code = [...text].map(char => char.codePointAt(0).toString(16)).join("-");
  const key = assets.has(code) ? code : code.replace(/-fe0f/g, "");
  return assets.has(key) ? new URL(`./assets/twemoji/${key}.svg`, import.meta.url).href : null;
}

export function emojiImage(text, onLoad) {
  const url = emojiAsset(text);
  if (!url) return null;
  if (!cache.has(url)) {
    const image = new Image();
    const entry = { image: null, ready: null };
    entry.ready = new Promise(resolve => {
      image.onload = () => { entry.image = image; resolve(); onLoad?.(); };
      image.onerror = () => resolve();
    });
    cache.set(url, entry);
    image.src = url;
  }
  return cache.get(url).image;
}

export async function prepareEmoji(text) {
  const pending = [];
  for (const { segment } of segments.segment(text)) {
    const url = emojiAsset(segment);
    if (!url) continue;
    emojiImage(segment);
    pending.push(cache.get(url).ready);
  }
  await Promise.all(pending);
}

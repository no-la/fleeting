import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { emojiAsset } from "../emoji-art.mjs";

test("SVG lookup handles selectors, joined emoji, flags and mixed tones", () => {
  for (const emoji of ["😂", "❤️", "👩‍💻", "🏳️‍🌈", "🇯🇵", "🫱🏻‍🫲🏿", "1️⃣"]) {
    const url = emojiAsset(emoji);
    assert.ok(url, emoji);
    assert.ok(existsSync(new URL(url)), emoji);
  }
  for (const text of ["A", "1", "こんにちは", "❤︎", "🫫"]) assert.equal(emojiAsset(text), null);
});

test("every resolved catalog entry points to a bundled SVG", () => {
  const catalog = JSON.parse(readFileSync(new URL("../data/emoji.json", import.meta.url)));
  let supported = 0;
  for (const entry of catalog.emojis) {
    const url = emojiAsset(entry.emoji);
    if (url) {
      assert.ok(existsSync(new URL(url)), entry.emoji);
      supported++;
    }
  }
  assert.ok(supported > 3900);
});

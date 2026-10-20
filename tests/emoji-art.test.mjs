import test from "node:test";
import assert from "node:assert/strict";
import { isEmoji } from "../emoji-art.mjs";

test("native emoji detection preserves joined sequences, flags, tones and keycaps", () => {
  for (const emoji of ["😂", "❤️", "👩‍💻", "🏳️‍🌈", "🇯🇵", "🫱🏻‍🫲🏿", "1️⃣", "🏽"]) assert.equal(isEmoji(emoji), true, emoji);
  for (const text of ["", "A", "1", "#", "こんにちは", "❤︎", "😂😂"]) assert.equal(isEmoji(text), false, text);
});

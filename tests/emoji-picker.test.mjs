import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { prepareCatalog, filterEmojis, groupEmojis } from "../emoji-picker.mjs";

const catalog = prepareCatalog(JSON.parse(await readFile(new URL("../data/emoji.json", import.meta.url), "utf8")));

test("catalog includes flags, ZWJ sequences, mixed skin tones, components and Emoji 18 additions", () => {
  const available = new Set(catalog.emojis.map(entry => entry.emoji));
  assert.equal(available.size, 3972);
  for (const emoji of ["🇯🇵", "👩🏽‍💻", "🫱🏽‍🫲🏻", "👨‍👩‍👧‍👦", "🏳️‍🌈", "🦰", "🫫"]) {
    assert.ok(available.has(emoji), `${emoji} is missing`);
  }
  assert.equal(catalog.groups.length, 10);
});

test("Japanese, kana, English and emoji searches include entries beyond the first page", () => {
  const search = query => filterEmojis(catalog.emojis, { query }).map(entry => entry.emoji);
  assert.ok(search("ねこ").includes("🐈"));
  assert.deepEqual(search("ネコ"), search("ねこ"));
  assert.ok(search("cat face").includes("🐱"));
  assert.ok(search("日本").includes("🇯🇵"));
  assert.deepEqual(search("🇯🇵"), ["🇯🇵"]);
  assert.ok(search("👩🏽‍💻").includes("👩🏽‍💻"));
  assert.ok(search("❤️").includes("❤️"));
});

test("category and tone filters retain mixed tone combinations", () => {
  const matches = filterEmojis(catalog.emojis, { group: "People & Body", tone: "1" });
  assert.ok(matches.some(entry => entry.emoji === "🫱🏽‍🫲🏻"));
  assert.ok(matches.every(entry => entry.group === "People & Body" && entry.tones.includes(1)));
  assert.ok(filterEmojis(catalog.emojis, { tone: "none" }).every(entry => entry.tones.length === 0));
  assert.equal(filterEmojis(catalog.emojis).length, catalog.count);
});

test("unknown queries produce an empty result, not a fallback subset", () => {
  assert.deepEqual(filterEmojis(catalog.emojis, { query: "nonexistent-emoji-12345" }), []);
});

test("grouping skin tones keeps every Unicode sequence reachable", () => {
  const groups = groupEmojis(catalog.emojis);
  const sequences = groups.flatMap(group => group.variants.map(entry => entry.emoji));
  assert.equal(sequences.length, catalog.count);
  assert.equal(new Set(sequences).size, catalog.count);
  const thumbs = groups.find(group => group.entry.emoji === "👍");
  assert.equal(thumbs.variants.length, 6);
  assert.ok(thumbs.variants.some(entry => entry.emoji === "👍🏿"));
  const mixed = groups.find(group => group.variants.some(entry => entry.emoji === "🫱🏽‍🫲🏻"));
  assert.ok(mixed);
  assert.ok(mixed.variants.length > 6);
});

test("an exact skin-tone query preserves that sequence as the tap target", () => {
  const groups = groupEmojis(filterEmojis(catalog.emojis, { query: "👩🏽‍💻" }));
  assert.equal(groups.length, 1);
  assert.equal(groups[0].entry.emoji, "👩🏽‍💻");
});

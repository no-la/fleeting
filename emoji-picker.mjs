import { emojiAsset } from "./emoji-art.mjs";

const PAGE_SIZE = 90;
const RECENTS_KEY = "fleeting-recent-emojis";
const SUGGESTED = ["🔥", "💯", "❤️", "💔", "😍", "😂", "🤫", "🤯", "🙄", "🤔", "🥺", "😭", "✨", "🎉", "👍"];
let catalogPromise;

export function normalizeSearch(value) {
  return value.normalize("NFKC").toLowerCase().replace(/\ufe0f/g, "")
    .replace(/[\u30a1-\u30f6]/g, char => String.fromCharCode(char.charCodeAt(0) - 0x60));
}

export function prepareCatalog(catalog) {
  return {
    ...catalog,
    emojis: catalog.emojis.map(entry => ({
      ...entry,
      search: normalizeSearch(`${entry.emoji} ${entry.name} ${entry.keywords}`),
    })),
  };
}

export function filterEmojis(entries, { query = "", group = "", tone = "all" } = {}) {
  const terms = normalizeSearch(query).trim().split(/\s+/).filter(Boolean);
  return entries.filter(entry =>
    (!group || entry.group === group) &&
    (tone === "all" || (tone === "none" ? !entry.tones.length : entry.tones.includes(Number(tone)))) &&
    terms.every(term => entry.search.includes(term)));
}

export function groupEmojis(entries) {
  const groups = new Map();
  for (const entry of entries) {
    const key = entry.emoji.replace(/[\u{1f3fb}-\u{1f3ff}\ufe0f]/gu, "");
    if (!groups.has(key)) groups.set(key, { key, entry, variants: [] });
    const group = groups.get(key);
    group.variants.push(entry);
    if (!entry.tones.length) group.entry = entry;
  }
  return [...groups.values()];
}

async function loadCatalog() {
  if (!catalogPromise) {
    catalogPromise = fetch(new URL("./data/emoji.json", import.meta.url))
      .then(response => {
        if (!response.ok) throw new Error("Emoji catalog unavailable");
        return response.json();
      })
      .then(prepareCatalog)
      .catch(error => { catalogPromise = null; throw error; });
  }
  return catalogPromise;
}

export async function openEmojiPicker({ dialog, onSelect }) {
  const content = dialog.querySelector("#sheet-content");
  dialog.classList.add("emoji-sheet");
  dialog.querySelector("#sheet-title").textContent = "絵文字";
  content.innerHTML = `
    <div class="emoji-searchbar">
      <button id="emoji-back" aria-label="絵文字一覧に戻る" hidden>‹</button>
      <label class="sr-only" for="emoji-search">絵文字を検索</label>
      <input id="emoji-search" type="search" placeholder="絵文字を検索" autocomplete="off" disabled>
      <span id="emoji-variant-title" hidden>肌の色を選択</span>
      <button id="emoji-cancel">キャンセル</button>
    </div>
    <p id="emoji-count" class="sr-only" role="status" aria-live="polite">読み込み中</p>
    <div id="emoji-results">
      <div class="emoji-grid" aria-label="絵文字一覧"></div>
      <p id="emoji-empty">絵文字を読み込んでいます…</p>
      <button id="retry-emoji" class="sheet-button" hidden>再読み込み</button>
      <div id="emoji-sentinel" aria-hidden="true"></div>
    </div>
    <p class="emoji-note">長押しで肌の色を変更</p>`;
  const find = selector => content.querySelector(selector);
  const search = find("#emoji-search"), grid = find(".emoji-grid"), results = find("#emoji-results");
  let observer, holdTimer, closed = false;
  dialog.addEventListener("close", () => {
    closed = true;
    clearTimeout(holdTimer);
    observer?.disconnect();
    dialog.classList.remove("emoji-sheet");
  }, { once: true });
  find("#emoji-cancel").onclick = () => dialog.close();
  dialog.showModal();
  let catalog;
  let allGroups, matches = [], shown = 0, variantOf = null, previousScroll = 0, previousShown = 0;

  function select(emoji) {
    try {
      const recent = JSON.parse(localStorage.getItem(RECENTS_KEY) || "[]");
      localStorage.setItem(RECENTS_KEY, JSON.stringify([emoji, ...recent.filter(value => value !== emoji)].slice(0, 18)));
    } catch { /* Recents are optional. */ }
    onSelect(emoji);
    dialog.close();
  }

  function emojiTile(group) {
    const { entry, variants } = group;
    const tile = document.createElement("div");
    tile.className = "emoji-tile";
    const button = document.createElement("button");
    button.type = "button";
    button.className = "emoji-choice";
    button.textContent = entry.emoji;
    const url = emojiAsset(entry.emoji);
    if (url) {
      const image = document.createElement("img");
      image.src = url;
      image.alt = "";
      image.draggable = false;
      image.loading = "lazy";
      image.onerror = () => { button.textContent = entry.emoji; };
      button.replaceChildren(image);
    }
    button.setAttribute("aria-label", entry.name);
    button.title = entry.name;
    button.dataset.emoji = entry.emoji;
    let held = false, start;
    button.onclick = () => { if (!held) select(entry.emoji); };
    tile.append(button);
    if (!variantOf && variants.length > 1) {
      const open = () => {
        held = true;
        clearTimeout(holdTimer);
        previousScroll = results.scrollTop;
        previousShown = shown;
        variantOf = group;
        search.blur();
        render();
      };
      button.onpointerdown = event => {
        held = false;
        start = { x: event.clientX, y: event.clientY };
        holdTimer = setTimeout(open, 450);
      };
      button.onpointermove = event => {
        if (start && Math.hypot(event.clientX - start.x, event.clientY - start.y) > 8) clearTimeout(holdTimer);
      };
      button.onpointerup = button.onpointercancel = button.onpointerleave = () => clearTimeout(holdTimer);
      button.oncontextmenu = event => { event.preventDefault(); if (!held) open(); };
      const variantButton = document.createElement("button");
      variantButton.className = "emoji-variants";
      variantButton.textContent = "◢";
      variantButton.setAttribute("aria-label", `${entry.name}の肌色を選択`);
      variantButton.onclick = open;
      tile.append(variantButton);
    }
    return tile;
  }

  function appendPage(amount = PAGE_SIZE) {
    const page = matches.slice(shown, shown + amount);
    const fragment = document.createDocumentFragment();
    for (const group of page) fragment.append(emojiTile(group));
    grid.append(fragment);
    shown += page.length;
    find("#emoji-sentinel").hidden = shown >= matches.length;
  }

  function render(restore = false) {
    clearTimeout(holdTimer);
    if (variantOf) {
      matches = variantOf.variants.map(entry => ({ entry, variants: [entry] }));
    } else {
      matches = groupEmojis(filterEmojis(catalog.emojis, { query: search.value }))
        .map(group => ({ ...group, variants: allGroups.get(group.key).variants }));
      if (!search.value.trim()) {
        let recents = [];
        try {
          const saved = JSON.parse(localStorage.getItem(RECENTS_KEY) || "[]");
          if (Array.isArray(saved)) recents = saved;
        } catch {}
        for (const group of matches) {
          const recent = recents.find(emoji => group.variants.some(entry => entry.emoji === emoji));
          if (recent) group.entry = group.variants.find(entry => entry.emoji === recent);
        }
        const priority = [...recents, ...SUGGESTED];
        const rank = group => Math.min(...group.variants.map(entry => {
          const index = priority.indexOf(entry.emoji);
          return index === -1 ? Infinity : index;
        }));
        matches.sort((a, b) => rank(a) - rank(b));
      }
    }
    find("#emoji-back").hidden = !variantOf;
    find("#emoji-variant-title").hidden = !variantOf;
    search.hidden = Boolean(variantOf);
    shown = 0;
    grid.replaceChildren();
    results.scrollTop = 0;
    find("#emoji-empty").hidden = Boolean(matches.length);
    find("#emoji-empty").textContent = "見つかりませんでした。別の言葉で検索してください。";
    find("#emoji-count").textContent = `${matches.length.toLocaleString("ja-JP")}件`;
    appendPage(restore ? Math.max(PAGE_SIZE, previousShown) : PAGE_SIZE);
    if (restore) results.scrollTop = previousScroll;
  }

  async function initialize() {
    find("#retry-emoji").hidden = true;
    try {
      catalog = await loadCatalog();
      if (closed || !dialog.open) return;
      allGroups = new Map(groupEmojis(catalog.emojis).map(group => [group.key, group]));
      search.disabled = false;
      observer = new IntersectionObserver(entries => {
        if (entries.some(entry => entry.isIntersecting) && shown < matches.length) appendPage();
      }, { root: results, rootMargin: "300px" });
      observer.observe(find("#emoji-sentinel"));
      render();
    } catch {
      if (closed) return;
      find("#emoji-empty").textContent = "絵文字を読み込めませんでした。";
      find("#retry-emoji").hidden = false;
    }
  }
  search.oninput = () => render();
  find("#emoji-back").onclick = () => { variantOf = null; render(true); };
  find("#retry-emoji").onclick = initialize;
  await initialize();
}

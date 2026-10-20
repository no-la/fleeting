const PAGE_SIZE = 120;
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
  content.innerHTML = '<p role="status">絵文字を読み込んでいます…</p>';
  dialog.addEventListener("close", () => dialog.classList.remove("emoji-sheet"), { once: true });
  dialog.showModal();
  let catalog;
  try {
    catalog = await loadCatalog();
  } catch {
    if (!dialog.open) return;
    content.innerHTML = '<p role="status">絵文字を読み込めませんでした。</p><button id="retry-emoji" class="sheet-button">再読み込み</button>';
    content.querySelector("#retry-emoji").onclick = () => {
      dialog.close();
      openEmojiPicker({ dialog, onSelect });
    };
    return;
  }
  // The user may have closed the picker while its data was loading.
  if (!dialog.open || !dialog.classList.contains("emoji-sheet")) return;
  content.innerHTML = `
    <label class="sr-only" for="emoji-search">絵文字を検索</label>
    <input id="emoji-search" type="search" placeholder="日本語・英語・絵文字で検索" autocomplete="off">
    <div class="emoji-filters">
      <label class="sr-only" for="emoji-category">カテゴリ</label>
      <select id="emoji-category"><option value="">すべてのカテゴリ</option></select>
      <label class="sr-only" for="emoji-tone">肌の色</label>
      <select id="emoji-tone">
        <option value="all">肌の色：すべて</option>
        <option value="none">標準・肌色なし</option>
        <option value="1">🏻 薄い肌色</option>
        <option value="2">🏼 やや薄い肌色</option>
        <option value="3">🏽 中間の肌色</option>
        <option value="4">🏾 やや濃い肌色</option>
        <option value="5">🏿 濃い肌色</option>
      </select>
    </div>
    <p id="emoji-count" role="status" aria-live="polite"></p>
    <div id="emoji-results">
      <div class="emoji-grid" aria-label="絵文字一覧"></div>
      <p id="emoji-empty" hidden>見つかりませんでした。検索語や絞り込みを変えてみてください。</p>
      <button id="emoji-more" class="sheet-button">もっと表示</button>
    </div>
    <p class="emoji-note">端末が未対応の絵文字は、四角や分かれた文字で表示されることがあります。</p>`;
  const find = selector => content.querySelector(selector);
  const category = find("#emoji-category"), tone = find("#emoji-tone"), search = find("#emoji-search");
  for (const group of catalog.groups) {
    const option = document.createElement("option");
    option.value = group.id;
    option.textContent = group.name;
    category.append(option);
  }
  let matches = [], shown = 0;
  const grid = find(".emoji-grid"), more = find("#emoji-more");
  function appendPage() {
    const page = matches.slice(shown, shown + PAGE_SIZE);
    const fragment = document.createDocumentFragment();
    for (const entry of page) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = entry.emoji;
      button.setAttribute("aria-label", entry.name);
      button.title = entry.name;
      button.dataset.emoji = entry.emoji;
      button.onclick = () => { onSelect(entry.emoji); dialog.close(); };
      fragment.append(button);
    }
    grid.append(fragment);
    shown += page.length;
    more.hidden = shown >= matches.length;
    more.textContent = `もっと表示（残り${matches.length - shown}件）`;
    find("#emoji-count").textContent = `${matches.length.toLocaleString("ja-JP")}件 · ${shown.toLocaleString("ja-JP")}件を表示`;
  }
  function render() {
    matches = filterEmojis(catalog.emojis, { query: search.value, group: category.value, tone: tone.value });
    shown = 0;
    grid.replaceChildren();
    find("#emoji-results").scrollTop = 0;
    find("#emoji-empty").hidden = Boolean(matches.length);
    appendPage();
  }
  search.oninput = category.onchange = tone.onchange = render;
  more.onclick = appendPage;
  render();
}

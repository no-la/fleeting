"use strict";

const $ = selector => document.querySelector(selector);
const canvas = $("#canvas"), ctx = canvas.getContext("2d");
const WIDTH = 1080, HEIGHT = 1920, STORAGE = "fleeting-v2";
const FONT = '-apple-system, BlinkMacSystemFont, "Helvetica Neue", "Hiragino Kaku Gothic ProN", sans-serif';
const backgrounds = [
  ["ミッドナイト", "#405561", "#0b141c", "#223c44"],
  ["ライト", "#bacbd5", "#f0f4f6", "#8ca1ad"],
  ["ブルー", "#298fce", "#1368a7", "#073b68"],
  ["パープル", "#7748a1", "#372952", "#242447"],
  ["ピンク", "#ed91b5", "#b65187", "#8e416f"],
  ["オレンジ", "#e9af6f", "#d17553", "#ac4d43"],
  ["グリーン", "#6aaf9b", "#286458", "#153e40"],
  ["ブラック", "#000000", "#000000", "#000000"],
];
const colors = ["#ffffff", "#000000", "#1da1f2", "#ffd400", "#f45d22", "#e0245e", "#794bc4", "#17bf63", "#ffadce", "#aab8c2"];
const freshState = () => ({ background: 0, custom: "#15232d", photo: null, fit: "contain", layers: [] });
let state = freshState();
let selected = null, edit = null, photo = null, photoSource = null;
let history = [], saveTimer, statusTimer, drag = null;
const pointers = new Map(), bounds = new Map();

function notice(message) {
  $("#status").textContent = message;
  $("#status").classList.add("visible");
  clearTimeout(statusTimer);
  statusTimer = setTimeout(() => $("#status").classList.remove("visible"), 2500);
}
function store() {
  try { localStorage.setItem(STORAGE, JSON.stringify(state)); }
  catch { notice("下書きを保存できません。画像を保存してください。"); }
}
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(store, 250);
}
function checkpoint() {
  history.push(JSON.stringify(state));
  if (history.length > 20) history.shift();
}
function currentLayer() {
  return state.layers.find(layer => layer.id === selected);
}
function createLayer(text = "") {
  return { id: crypto.randomUUID(), text, x: 540, y: 960, size: 72, angle: 0, bold: false, highlight: false, color: "#ffffff", align: "center" };
}
function splitLines(text, maxWidth) {
  const lines = [];
  for (const paragraph of text.split("\n")) {
    let line = "";
    for (const character of Array.from(paragraph)) {
      if (line && ctx.measureText(line + character).width > maxWidth) {
        lines.push(line);
        line = character;
      } else line += character;
    }
    lines.push(line);
  }
  return lines;
}
function layout(layer) {
  // Fix wrapping at the original size: pinching scales the whole text object.
  ctx.font = `${layer.bold ? 700 : 400} 72px ${FONT}`;
  const lines = splitLines(layer.text, 900);
  const size = layer.size * Math.min(1, 1700 / (lines.length * 72 * 1.3));
  ctx.font = `${layer.bold ? 700 : 400} ${size}px ${FONT}`;
  return { lines, size, width: Math.max(1, ...lines.map(line => ctx.measureText(line).width)), height: lines.length * size * 1.3 };
}
function contrast(hex) {
  const rgb = hex.slice(1).match(/../g).map(value => parseInt(value, 16));
  return rgb[0] * .299 + rgb[1] * .587 + rgb[2] * .114 > 155 ? "#0f1419" : "#ffffff";
}
function drawBackground() {
  if (state.background === -1) ctx.fillStyle = state.custom;
  else {
    const palette = backgrounds[state.background] || backgrounds[0];
    const gradient = ctx.createLinearGradient(0, 0, WIDTH, HEIGHT);
    gradient.addColorStop(0, palette[1]);
    gradient.addColorStop(.62, palette[2]);
    gradient.addColorStop(1, palette[3]);
    ctx.fillStyle = gradient;
  }
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  if (photo) {
    const scale = (state.fit === "cover" ? Math.max : Math.min)(WIDTH / photo.width, HEIGHT / photo.height);
    const width = photo.width * scale, height = photo.height * scale;
    ctx.drawImage(photo, (WIDTH - width) / 2, (HEIGHT - height) / 2, width, height);
  }
}
function renderLayer(layer) {
  ctx.save();
  const box = layout(layer);
  bounds.set(layer.id, box);
  ctx.translate(layer.x, layer.y);
  ctx.rotate(layer.angle);
  ctx.textBaseline = "middle";
  ctx.textAlign = layer.align;
  const x = layer.align === "left" ? -box.width / 2 : layer.align === "right" ? box.width / 2 : 0;
  const step = box.size * 1.3;
  box.lines.forEach((line, index) => {
    const y = (index - (box.lines.length - 1) / 2) * step, width = ctx.measureText(line).width;
    if (layer.highlight && line) {
      const left = layer.align === "left" ? x : layer.align === "right" ? x - width : x - width / 2;
      ctx.fillStyle = layer.color;
      ctx.beginPath();
      ctx.roundRect(left - 14, y - step / 2 - 1, width + 28, step + 2, 9);
      ctx.fill();
    }
    ctx.fillStyle = layer.highlight ? contrast(layer.color) : layer.color;
    ctx.fillText(line, x, y);
  });
  ctx.restore();
}
function draw(exporting = false) {
  ctx.clearRect(0, 0, WIDTH, HEIGHT);
  drawBackground();
  bounds.clear();
  for (const layer of state.layers) {
    if (!edit || layer.id !== edit.id || exporting) renderLayer(layer);
  }
}
function refresh() {
  draw();
  $("#placeholder").hidden = Boolean(state.layers.length || photo || edit);
  $("#export").disabled = !(state.layers.length || photo);
  $("#undo").disabled = history.length === 0;
  $("#adjust").disabled = !currentLayer();
  $("#gesture-hint").hidden = !currentLayer() || Boolean(edit);
  $("#text-mode").setAttribute("aria-current", !photo);
  $("#photo-mode").setAttribute("aria-current", Boolean(photo));
  const palette = backgrounds[state.background];
  $(".background-dot").style.background = palette ? `linear-gradient(135deg,${palette[1]},${palette[3]})` : state.custom;
}
function changed() { refresh(); save(); }

function openEditor(layer) {
  if (edit) return;
  selected = layer?.id || null;
  edit = layer ? { ...layer } : createLayer();
  $("#words").value = edit.text;
  $("#text-editor").hidden = false;
  $("#edit-tools").hidden = false;
  document.body.classList.add("editing");
  refresh();
  updateTextStyle();
  $("#words").focus({ preventScroll: true });
  $("#words").setSelectionRange(edit.text.length, edit.text.length);
}
function resizeInput() {
  const input = $("#words");
  input.style.height = "auto";
  input.style.height = `${Math.max(48, input.scrollHeight)}px`;
}
function updateTextStyle() {
  const input = $("#words");
  input.style.fontWeight = edit.bold ? "700" : "400";
  input.style.textAlign = edit.align;
  input.style.color = edit.highlight ? contrast(edit.color) : edit.color;
  input.style.backgroundColor = edit.highlight ? edit.color : "transparent";
  $("#bold").setAttribute("aria-pressed", edit.bold);
  $("#highlight").setAttribute("aria-pressed", edit.highlight);
  $("#align").setAttribute("aria-label", `文字揃え：${{ left: "左", center: "中央", right: "右" }[edit.align]}`);
  const start = { left: 4, center: 7, right: 10 }[edit.align];
  $("#align path").setAttribute("d", `M4 5h16M${start} 10h10M4 15h16M${start} 20h10`);
  for (const button of $("#color-strip").children) button.setAttribute("aria-pressed", button.dataset.color === edit.color);
  resizeInput();
}
function closeEditor(commit) {
  if (!edit) return;
  if (commit) {
    checkpoint();
    edit.text = $("#words").value;
    const index = state.layers.findIndex(layer => layer.id === edit.id);
    if (edit.text.trim()) {
      if (index < 0) state.layers.push(edit);
      else state.layers[index] = edit;
      selected = edit.id;
    } else {
      if (index >= 0) state.layers.splice(index, 1);
      selected = null;
    }
  }
  edit = null;
  $("#words").blur();
  $("#text-editor").hidden = true;
  $("#edit-tools").hidden = true;
  $("#color-strip").hidden = true;
  document.body.classList.remove("editing");
  changed();
}
$("#placeholder").onclick = $("#add-text").onclick = () => openEditor();
$("#text-mode").onclick = () => {
  if (photo) {
    checkpoint();
    state.photo = null;
    photo = null;
    photoSource = null;
    changed();
  } else if (!state.layers.length) openEditor();
};
$("#done").onclick = () => closeEditor(true);
$("#cancel-edit").onclick = () => closeEditor(false);
$("#words").oninput = resizeInput;
$("#words").onkeydown = event => {
  if (event.key === "Escape") closeEditor(false);
  if ((event.metaKey || event.ctrlKey) && event.key === "Enter") closeEditor(true);
};
for (const id of ["bold", "highlight"]) {
  $(`#${id}`).onpointerdown = event => event.preventDefault();
  $(`#${id}`).onclick = () => { edit[id] = !edit[id]; updateTextStyle(); };
}
$("#align").onpointerdown = event => event.preventDefault();
$("#align").onclick = () => {
  edit.align = { center: "right", right: "left", left: "center" }[edit.align];
  updateTextStyle();
};
$("#text-color").onpointerdown = event => event.preventDefault();
$("#text-color").onclick = () => { $("#color-strip").hidden = !$("#color-strip").hidden; };
colors.forEach(color => {
  const button = document.createElement("button");
  button.className = "swatch";
  button.dataset.color = color;
  button.style.background = color;
  button.setAttribute("aria-label", `色 ${color}`);
  button.onpointerdown = event => event.preventDefault();
  button.onclick = () => { edit.color = color; updateTextStyle(); };
  $("#color-strip").append(button);
});

function showSheet(title, html) {
  $("#sheet-title").textContent = title;
  $("#sheet-content").innerHTML = html;
  $("#sheet").showModal();
}
$("#close-sheet").onclick = () => $("#sheet").close();
$("#background").onclick = () => {
  showSheet("背景", `<div class="palette-grid">${backgrounds.map((p, i) => `<button data-background="${i}" aria-label="${p[0]}" aria-pressed="${state.background === i}" style="background:linear-gradient(135deg,${p[1]},${p[2]},${p[3]})"></button>`).join("")}</div>
    <label class="sheet-row">好きな色<input id="custom" type="color" value="${state.custom}"></label>
    ${photo ? '<button id="photo-fit" class="sheet-button">写真の全体表示 / 全面表示</button> <button id="remove-photo" class="sheet-button">写真を外す</button>' : ""}`);
  document.querySelectorAll("[data-background]").forEach(button => {
    button.onclick = () => {
      checkpoint();
      state.background = Number(button.dataset.background);
      changed();
      $("#sheet").close();
    };
  });
  $("#custom").onchange = event => { checkpoint(); state.background = -1; state.custom = event.target.value; changed(); };
  if (photo) {
    $("#photo-fit").onclick = () => { checkpoint(); state.fit = state.fit === "contain" ? "cover" : "contain"; changed(); $("#sheet").close(); };
    $("#remove-photo").onclick = () => {
      checkpoint();
      state.photo = null;
      photo = null;
      photoSource = null;
      changed();
      $("#sheet").close();
    };
  }
};
$("#adjust").onclick = () => {
  const layer = currentLayer();
  if (!layer) return;
  checkpoint();
  showSheet("文字の調整", `
    <label class="sheet-row">サイズ<input id="size" type="range" min="24" max="240" value="${layer.size}"></label>
    <label class="sheet-row">角度<input id="angle" type="range" min="-180" max="180" value="${layer.angle * 180 / Math.PI}"></label>
    <div class="dialog-actions"><button id="delete-layer" class="sheet-button">削除</button><button id="edit-layer" class="pill">文字を編集</button></div>`);
  $("#size").oninput = event => { layer.size = Number(event.target.value); changed(); };
  $("#angle").oninput = event => { layer.angle = Number(event.target.value) * Math.PI / 180; changed(); };
  $("#delete-layer").onclick = () => {
    state.layers = state.layers.filter(item => item.id !== selected);
    selected = null;
    changed();
    $("#sheet").close();
  };
  $("#edit-layer").onclick = () => { $("#sheet").close(); openEditor(layer); };
};
$("#stickers").onclick = () => {
  const emojis = ["😊", "🥺", "😂", "🥰", "🤔", "❤️", "✨", "🌸", "🌙", "☀️", "🔥", "🎉", "🐈", "☕", "🍮"];
  showSheet("絵文字", `<div class="emoji-grid">${emojis.map(emoji => `<button aria-label="${emoji}">${emoji}</button>`).join("")}</div>`);
  document.querySelectorAll(".emoji-grid button").forEach(button => {
    button.onclick = () => {
      checkpoint();
      const layer = createLayer(button.textContent);
      layer.size = 170;
      state.layers.push(layer);
      selected = layer.id;
      changed();
      $("#sheet").close();
    };
  });
};
$("#help").onclick = () => showSheet("使い方", `
  <ul><li>画面をタップ、または「Aa」で文字を追加。</li><li>文字をタップして再編集。ドラッグで移動。</li><li>2本指で広げてサイズ変更、ひねって回転。</li><li>文字を下のゴミ箱に運ぶと削除。上の矢印で元に戻せます。</li><li>パソコンでは文字を選び、矢印キーで移動。調整ボタンからサイズ・角度を変更できます。</li></ul>
  <p>「保存」で1080 × 1920のPNGをダウンロードします。写真と下書きはこのブラウザ内に保存されます。</p>
  <p>Twitter Fleetsの編集画面を参考にした個人制作です。Twitter / Xの公式サービスではありません。動画・投稿機能はありません。</p>`);

function loadImage(source) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = source;
  });
}
async function syncPhoto() {
  const source = state.photo;
  if (source === photoSource) return;
  photo = null;
  photoSource = source;
  if (source) {
    try {
      const image = await loadImage(source);
      if (state.photo === source) photo = image;
    } catch { notice("写真を復元できませんでした。"); }
  }
  refresh();
}
async function importPhoto(event) {
  const file = event.target.files[0];
  if (!file) return;
  const source = URL.createObjectURL(file);
  try {
    const image = await loadImage(source);
    const buffer = document.createElement("canvas");
    const ratio = Math.min(1, 1920 / Math.max(image.width, image.height));
    buffer.width = Math.round(image.width * ratio);
    buffer.height = Math.round(image.height * ratio);
    buffer.getContext("2d").drawImage(image, 0, 0, buffer.width, buffer.height);
    const data = buffer.toDataURL("image/jpeg", .86), normalized = await loadImage(data);
    checkpoint();
    state.photo = data;
    state.fit = "contain";
    photo = normalized;
    photoSource = data;
    changed();
  } catch { notice("写真を読み込めません。JPEGやPNGをお試しください。"); }
  finally { URL.revokeObjectURL(source); event.target.value = ""; }
}
$("#photo-mode").onclick = () => $("#photo").click();
$("#camera-mode").onclick = () => $("#camera").click();
$("#photo").onchange = $("#camera").onchange = importPhoto;

function point(event) {
  const rect = canvas.getBoundingClientRect();
  return { x: (event.clientX - rect.left) * WIDTH / rect.width, y: (event.clientY - rect.top) * HEIGHT / rect.height };
}
function hitTest(point) {
  return [...state.layers].reverse().find(layer => {
    const box = bounds.get(layer.id);
    if (!box) return false;
    const dx = point.x - layer.x, dy = point.y - layer.y;
    const x = dx * Math.cos(layer.angle) + dy * Math.sin(layer.angle);
    const y = -dx * Math.sin(layer.angle) + dy * Math.cos(layer.angle);
    return Math.abs(x) < box.width / 2 + 32 && Math.abs(y) < box.height / 2 + 32;
  });
}
function pairGeometry() {
  const [a, b] = [...pointers.values()];
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, distance: Math.hypot(b.x - a.x, b.y - a.y), angle: Math.atan2(b.y - a.y, b.x - a.x) };
}
function overTrash(event) {
  const rect = $("#controls").getBoundingClientRect();
  return event.clientY >= rect.top && event.clientY <= rect.bottom && event.clientX >= rect.left && event.clientX <= rect.right;
}
canvas.onpointerdown = event => {
  if (edit || pointers.size >= 2) return;
  const p = point(event);
  pointers.set(event.pointerId, p);
  canvas.setPointerCapture(event.pointerId);
  if (pointers.size === 1) {
    const layer = hitTest(p);
    selected = layer?.id || null;
    drag = { layer, start: p, moved: false, before: JSON.stringify(state), x: layer?.x, y: layer?.y };
    refresh();
  } else if (drag?.layer) {
    drag.pair = pairGeometry();
    drag.original = { ...drag.layer };
    drag.moved = true;
    $("#trash").hidden = false;
  }
};
canvas.onpointermove = event => {
  if (!pointers.has(event.pointerId) || !drag) return;
  const p = point(event);
  pointers.set(event.pointerId, p);
  if (Math.hypot(p.x - drag.start.x, p.y - drag.start.y) > 12) drag.moved = true;
  if (!drag.layer || !drag.moved) return;
  const layer = drag.layer;
  if (pointers.size === 2 && drag.pair) {
    const pair = pairGeometry();
    layer.size = Math.max(24, Math.min(240, drag.original.size * pair.distance / Math.max(1, drag.pair.distance)));
    layer.angle = drag.original.angle + pair.angle - drag.pair.angle;
    layer.x = Math.max(0, Math.min(WIDTH, drag.original.x + pair.x - drag.pair.x));
    layer.y = Math.max(0, Math.min(HEIGHT, drag.original.y + pair.y - drag.pair.y));
  } else {
    layer.x = Math.max(0, Math.min(WIDTH, drag.x + p.x - drag.start.x));
    layer.y = Math.max(0, Math.min(HEIGHT, drag.y + p.y - drag.start.y));
  }
  $("#trash").hidden = false;
  $("#trash").classList.toggle("hot", overTrash(event));
  draw();
};
function endPointer(event, cancelled = false) {
  if (!pointers.has(event.pointerId)) return;
  pointers.delete(event.pointerId);
  if (!drag) return;
  if (pointers.size) {
    drag.pair = null;
    drag.start = [...pointers.values()][0];
    drag.x = drag.layer?.x;
    drag.y = drag.layer?.y;
    return;
  }
  const gesture = drag;
  drag = null;
  $("#trash").hidden = true;
  $("#trash").classList.remove("hot");
  if (cancelled) {
    state = JSON.parse(gesture.before);
    refresh();
    return;
  }
  if (gesture.moved && gesture.layer) {
    history.push(gesture.before);
    if (history.length > 20) history.shift();
    if (overTrash(event)) {
      state.layers = state.layers.filter(layer => layer.id !== gesture.layer.id);
      selected = null;
      notice("削除しました");
    }
    changed();
  } else if (!gesture.moved) openEditor(gesture.layer);
}
canvas.onpointerup = event => endPointer(event);
canvas.onpointercancel = event => endPointer(event, true);
canvas.onkeydown = event => {
  const layer = currentLayer();
  if (event.key === "Enter") { event.preventDefault(); openEditor(layer); return; }
  if (!layer) return;
  const directions = { ArrowUp: [0, -10], ArrowDown: [0, 10], ArrowLeft: [-10, 0], ArrowRight: [10, 0] };
  if (directions[event.key]) {
    event.preventDefault();
    if (!event.repeat) checkpoint();
    layer.x = Math.max(0, Math.min(WIDTH, layer.x + directions[event.key][0]));
    layer.y = Math.max(0, Math.min(HEIGHT, layer.y + directions[event.key][1]));
    changed();
  }
};
$("#undo").onclick = async () => {
  if (!history.length) return;
  state = JSON.parse(history.pop());
  selected = null;
  await syncPhoto();
  changed();
  notice("元に戻しました");
};
$("#export").onclick = () => {
  draw(true);
  canvas.toBlob(blob => {
    if (!blob) { notice("画像の保存に失敗しました。"); return; }
    const url = URL.createObjectURL(blob), anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `fleeting-${new Date().toISOString().slice(0, 10)}.png`;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    notice("画像をダウンロードしました");
  }, "image/png");
};
$("#reset").onclick = () => $("#reset-dialog").showModal();
$("#cancel-reset").onclick = () => $("#reset-dialog").close();
$("#confirm-reset").onclick = () => {
  checkpoint();
  state = freshState();
  selected = null;
  photo = null;
  photoSource = null;
  changed();
  $("#reset-dialog").close();
};
function fitViewport() {
  document.documentElement.style.setProperty("--viewport-height", `${window.visualViewport?.height || window.innerHeight}px`);
  if (edit) resizeInput();
}
window.visualViewport?.addEventListener("resize", fitViewport);
window.addEventListener("resize", fitViewport);
window.addEventListener("pagehide", store);

// Keep the first version's drafts available after the UI upgrade.
try {
  const saved = JSON.parse(localStorage.getItem(STORAGE));
  if (saved && Array.isArray(saved.layers)) state = saved;
  else {
    const legacy = JSON.parse(localStorage.getItem("fleeting-v1"));
    if (legacy && typeof legacy.text === "string") {
      state.background = -1;
      state.custom = legacy.custom || "#15232d";
      state.photo = legacy.photo || null;
      if (legacy.text) {
        const layer = createLayer(legacy.text);
        for (const key of ["x", "y", "size", "color", "align", "highlight"]) {
          if (legacy[key] !== undefined) layer[key] = legacy[key];
        }
        layer.bold = true;
        state.layers.push(layer);
      }
    }
  }
} catch { /* Editing still works when browser storage is unavailable. */ }
fitViewport();
refresh();
syncPhoto();

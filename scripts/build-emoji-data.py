"""Build the bundled picker catalog from Unicode emoji-test and CLDR Japanese annotations.

Usage: python3 scripts/build-emoji-data.py /path/to/downloaded/sources
The directory must contain emoji-test.txt, ja.json, ja-derived.json, LICENSE.txt.
No build or network request is needed to run the website.
"""
import hashlib
import json
import re
import sys
from pathlib import Path

source = Path(sys.argv[1])
destination = Path(__file__).resolve().parents[1] / "data"
destination.mkdir(exist_ok=True)
text = (source / "emoji-test.txt").read_text()
version = re.search(r"^# Version: ([\d.]+)", text, re.M).group(1)
annotations = {}
for filename in ["ja.json", "ja-derived.json"]:
    document = json.loads((source / filename).read_text())
    entries = next(iter(document.values()))["annotations"]
    annotations.update({key.replace("\ufe0f", ""): value for key, value in entries.items()})

labels = {
    "Smileys & Emotion": "顔・感情", "People & Body": "人・からだ",
    "Component": "パーツ", "Animals & Nature": "動物・自然",
    "Food & Drink": "食べ物・飲み物", "Travel & Places": "旅行・場所",
    "Activities": "活動・イベント", "Objects": "もの",
    "Symbols": "記号", "Flags": "旗",
}
groups, emojis = [], []
for line in text.splitlines():
    if line.startswith("# group: "):
        group = line.removeprefix("# group: ")
        groups.append({"id": group, "name": labels[group]})
    match = re.match(r"^([A-F0-9 ]+)\s*;\s*(fully-qualified|component)\s*#\s*(\S+)\s+E[\d.]+\s+(.+)$", line)
    if not match:
        continue
    codepoints, _, emoji, english = match.groups()
    assert emoji == "".join(chr(int(codepoint, 16)) for codepoint in codepoints.split())
    annotation = annotations.get(emoji.replace("\ufe0f", ""), {})
    japanese = annotation.get("tts", [english])[0]
    keywords = list(dict.fromkeys([english, *annotation.get("default", [])]))
    emojis.append({
        "emoji": emoji, "name": japanese, "keywords": " ".join(keywords), "group": group,
        "tones": sorted({ord(char) - 0x1F3FA for char in emoji if 0x1F3FB <= ord(char) <= 0x1F3FF}),
    })

assert len(emojis) == len({entry["emoji"] for entry in emojis})
catalog = {
    "version": version, "count": len(emojis),
    "sources": {
        "emoji-test.txt": "https://www.unicode.org/Public/emoji/latest/emoji-test.txt",
        "ja.json": "https://raw.githubusercontent.com/unicode-org/cldr-json/main/cldr-json/cldr-annotations-full/annotations/ja/annotations.json",
        "ja-derived.json": "https://raw.githubusercontent.com/unicode-org/cldr-json/main/cldr-json/cldr-annotations-derived-full/annotationsDerived/ja/annotations.json",
    },
    "sha256": {name: hashlib.sha256((source / name).read_bytes()).hexdigest()
               for name in ["emoji-test.txt", "ja.json", "ja-derived.json"]},
    "groups": groups, "emojis": emojis,
}
(destination / "emoji.json").write_text(json.dumps(catalog, ensure_ascii=False, separators=(",", ":")) + "\n")
(destination / "UNICODE-LICENSE.txt").write_bytes((source / "LICENSE.txt").read_bytes())
print(f"Unicode Emoji {version}: {len(emojis)} entries, {len(groups)} categories")

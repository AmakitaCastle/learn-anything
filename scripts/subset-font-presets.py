"""Developer-only FontTools step; playback/export do not require Python."""
from pathlib import Path
from fontTools import subset
from fontTools.ttLib import TTFont

root = Path(__file__).resolve().parent.parent
characters = (root / "assets/fonts/preset-characters.txt").read_text()
characters += "".join(chr(i) for i in range(32, 127))
for font_id in ("xiaolai", "wenkai"):
    font = TTFont(root / f"assets/fonts/{font_id}.ttf")
    options = subset.Options()
    options.name_IDs = ["*"]
    options.name_legacy = True
    options.name_languages = ["*"]
    subsetter = subset.Subsetter(options=options)
    subsetter.populate(text=characters)
    subsetter.subset(font)
    # Rename modified subsets and preserve copyright/license name records.
    for record in font["name"].names:
        if record.nameID in (1, 3, 4, 6, 16, 17):
            record.string = f"LearnAnything {font_id} Preset".encode(record.getEncoding())
    font.save(root / f"packages/lesson-player/fonts/choices/{font_id}.ttf")

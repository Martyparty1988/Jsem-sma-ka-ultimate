from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TARGET = ROOT / "result-poster.css"

source = TARGET.read_text(encoding="utf-8")

old_content = """  .result-poster-v98 .result-content {
    isolation: isolate;
    position: relative !important;
    width: 100% !important;
    height: 100% !important;
    min-height: 0 !important;
    margin: 0 !important;
    color: #f8fbff;
  }
"""
new_content = """  .result-poster-v98 .result-content {
    isolation: isolate;
    position: relative !important;
    width: 100% !important;
    min-width: 0 !important;
    max-width: 100dvw !important;
    height: 100% !important;
    min-height: 0 !important;
    margin: 0 !important;
    color: #f8fbff;
  }
"""

old_score = """    justify-self: center;
    width: min(100%, 370px) !important;
    max-width: calc(100dvw - 28px) !important;
    min-width: 0 !important;
"""
new_score = """    grid-column: 1 / -1;
    justify-self: stretch;
    width: 100% !important;
    max-width: 100% !important;
    min-width: 0 !important;
"""

for old, new, label in (
    (old_content, new_content, "result-content containment"),
    (old_score, new_score, "score grid sizing"),
):
    count = source.count(old)
    if count != 1:
        raise RuntimeError(f"Expected one {label} target, found {count}")
    source = source.replace(old, new, 1)

TARGET.write_text(source, encoding="utf-8")
print("Constrained the v98 score to the available mobile grid column.")

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TESTS = ROOT / "tests"

REPLACEMENTS = (
    ("./lifecycle-runtime.js?v=87", "./lifecycle-runtime.js?v=98"),
    ("lifecycle-runtime.js?v=87", "lifecycle-runtime.js?v=98"),
    ("./app.js?v=87", "./app.js?v=98"),
    ("app.js?v=87", "app.js?v=98"),
    ("result-poster.css?v=96", "result-poster.css?v=98"),
    ("result-poster-runtime.js?v=96", "result-poster-runtime.js?v=98"),
)

STALE_TOKENS = tuple(old for old, _ in REPLACEMENTS)

for path in sorted(TESTS.glob("*.test.mjs")):
    source = path.read_text(encoding="utf-8")
    for old, new in REPLACEMENTS:
        source = source.replace(old, new)
    path.write_text(source, encoding="utf-8")

stale = []
for path in sorted(TESTS.glob("*.test.mjs")):
    source = path.read_text(encoding="utf-8")
    for token in STALE_TOKENS:
        if token in source:
            stale.append(f"{path.relative_to(ROOT)}: {token}")

if stale:
    raise RuntimeError("Stale asset contracts remain:\n" + "\n".join(stale))

print("Aligned v98 asset contracts across all Node tests.")

from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]

css_path = ROOT / 'result-poster.css'
css = css_path.read_text(encoding='utf-8')

replacements = (
    (
        "    grid-column: 1 / -1;\n    justify-self: stretch;",
        "    grid-column: 1 !important;\n    justify-self: stretch;",
        'score grid column',
    ),
    (
        "    z-index: 16 !important;\n    width: 100% !important;",
        "    z-index: 16 !important;\n    grid-column: 1 !important;\n    width: 100% !important;",
        'closed poster content grid column',
    ),
)

for old, new, label in replacements:
    count = css.count(old)
    if count != 1:
        raise RuntimeError(f'Expected one {label} target, found {count}')
    css = css.replace(old, new, 1)

css_path.write_text(css, encoding='utf-8')

# Replace temporary style diagnostics with permanent single-column assertions.
e2e_path = ROOT / 'tests/e2e/mobile-result.spec.mjs'
e2e = e2e_path.read_text(encoding='utf-8')
pattern = re.compile(
    r"  const scoreDiagnostics = await score\.evaluate\(\(node\) => \{[\s\S]*?"
    r"  expect\(badgeBox\.y \+ badgeBox\.height\)\.toBeLessThan\(scoreBox\.y\);\n"
)
replacement = """  const scoreStyle = await score.evaluate((node) => {
    const style = getComputedStyle(node);
    const parentStyle = getComputedStyle(node.parentElement);
    return {
      position: style.position,
      top: style.top,
      right: style.right,
      left: style.left,
      borderTopLeftRadius: Number.parseFloat(style.borderTopLeftRadius),
      parentGridColumns: parentStyle.gridTemplateColumns.split(/\\s+/).filter(Boolean)
    };
  });

  expect(scoreBox.x).toBeGreaterThanOrEqual(10);
  expect(scoreBox.x + scoreBox.width).toBeLessThanOrEqual(viewport.width - 10 + 1);
  expect(scoreBox.width).toBeGreaterThanOrEqual(viewport.width * 0.88);
  expect(Math.abs(scoreBox.x + scoreBox.width / 2 - viewport.width / 2)).toBeLessThanOrEqual(2);
  expect(scoreStyle.parentGridColumns).toHaveLength(1);
  expect(scoreStyle.position).toBe('relative');
  expect(scoreStyle.top).toBe('auto');
  expect(scoreStyle.right).toBe('auto');
  expect(scoreStyle.left).toBe('auto');
  expect(scoreStyle.borderTopLeftRadius).toBeLessThanOrEqual(40);
  expect(badgeBox.y + badgeBox.height).toBeLessThan(scoreBox.y);
"""

e2e, count = pattern.subn(replacement, e2e, count=1)
if count != 1:
    raise RuntimeError(f'Expected one diagnostic assertion block, replaced {count}')
e2e_path.write_text(e2e, encoding='utf-8')

pwa_path = ROOT / 'tests/pwa-cache.test.mjs'
pwa = pwa_path.read_text(encoding='utf-8')
needle = "  assert.match(css, /grid-row:\\s*2/);\n"
addition = needle + "  assert.match(css, /grid-column:\\s*1\\s*!important/);\n"
if pwa.count(needle) != 1:
    raise RuntimeError('Could not find the score grid-row contract')
pwa = pwa.replace(needle, addition, 1)
pwa_path.write_text(pwa, encoding='utf-8')

print('Locked every closed-poster content item to the single explicit grid column.')

from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding='utf-8')


def write(path: str, content: str) -> None:
    target = ROOT / path
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(content, encoding='utf-8')


def replace_required(source: str, old: str, new: str, label: str, count: int | None = 1) -> str:
    found = source.count(old)
    if count is not None and found != count:
        raise RuntimeError(f'Expected {count} occurrence(s) for {label}, found {found}')
    if count is None and found < 1:
        raise RuntimeError(f'Missing required target for {label}')
    return source.replace(old, new, found if count is None else count)


# Remove only obsolete selectors that let screens.css own mobile score geometry.
screens = read('screens.css')
leaf_rule = re.compile(r'(?P<selectors>[^{}]+)\{(?P<body>[^{}]*)\}')
removed_selectors: list[str] = []


def clean_rule(match: re.Match[str]) -> str:
    selectors_text = match.group('selectors')
    body = match.group('body')
    selectors = selectors_text.split(',')
    kept: list[str] = []

    for selector in selectors:
        normalized = ' '.join(selector.split())
        if 'body.result-in-frame' in normalized and '.effect-label' in normalized:
            removed_selectors.append(normalized)
            continue
        kept.append(selector)

    if len(kept) == len(selectors):
        return match.group(0)
    if not kept:
        return ''
    return ','.join(kept) + '{' + body + '}'


screens = leaf_rule.sub(clean_rule, screens)
if len(removed_selectors) < 5:
    raise RuntimeError(f'Expected several obsolete score selectors, removed only {len(removed_selectors)}')
if re.search(r'body\.result-in-frame[^,{]*\.effect-label', screens):
    raise RuntimeError('A body.result-in-frame effect-label selector survived the cleanup')
write('screens.css', screens)

# Bump only the assets changed by this release.
poster_css = read('result-poster.css')
poster_css = replace_required(poster_css, 'result-poster-v98', 'result-poster-v99', 'poster CSS class', None)
write('result-poster.css', poster_css)

poster_runtime = read('result-poster-runtime.js')
poster_runtime = replace_required(poster_runtime, "const VERSION = 'v98'", "const VERSION = 'v99'", 'poster runtime version')
poster_runtime = replace_required(poster_runtime, "const POSTER_CLASS = 'result-poster-v98'", "const POSTER_CLASS = 'result-poster-v99'", 'poster runtime class')
poster_runtime = replace_required(poster_runtime, 'version: 98', 'version: 99', 'poster public version')
write('result-poster-runtime.js', poster_runtime)

index = read('index.html')
for old, new, label in (
    ('screens.css?v=87', 'screens.css?v=99', 'screens stylesheet URL'),
    ('result-poster.css?v=98', 'result-poster.css?v=99', 'poster stylesheet URL'),
    ('result result-poster-v98 hidden', 'result result-poster-v99 hidden', 'dialog poster class'),
    ('data-result-poster="v98"', 'data-result-poster="v99"', 'dialog poster data version'),
    ('result-poster-runtime.js?v=98', 'result-poster-runtime.js?v=99', 'poster runtime URL'),
):
    index = replace_required(index, old, new, label)
write('index.html', index)

sw = read('service-worker.js')
for old, new, label in (
    ("const CACHE_VERSION = 'v98'", "const CACHE_VERSION = 'v99'", 'cache version'),
    ('./__smazka-update-state-v98', './__smazka-update-state-v99', 'update state key'),
    ('./screens.css?v=87', './screens.css?v=99', 'cached screens URL'),
    ('./result-poster.css?v=98', './result-poster.css?v=99', 'cached poster CSS URL'),
    ('./result-poster-runtime.js?v=98', './result-poster-runtime.js?v=99', 'cached poster runtime URL'),
):
    sw = replace_required(sw, old, new, label)
write('service-worker.js', sw)

# Align current release contracts without changing unchanged app/lifecycle asset URLs.
for path in sorted((ROOT / 'tests').glob('*.test.mjs')):
    source = path.read_text(encoding='utf-8')
    replacements = (
        ('PWA v98', 'PWA v99'),
        ('v98 cache graph', 'v99 cache graph'),
        ("'jsem-smazka-v98'", "'jsem-smazka-v99'"),
        ("CACHE_VERSION = 'v98'", "CACHE_VERSION = 'v99'"),
        ('__smazka-update-state-v98', '__smazka-update-state-v99'),
        ('screens.css?v=87', 'screens.css?v=99'),
        (r'screens\.css\?v=87', r'screens\.css\?v=99'),
        ('result-poster.css?v=98', 'result-poster.css?v=99'),
        (r'result-poster\.css\?v=98', r'result-poster\.css\?v=99'),
        ('result-poster-runtime.js?v=98', 'result-poster-runtime.js?v=99'),
        (r'result-poster-runtime\.js\?v=98', r'result-poster-runtime\.js\?v=99'),
        ('result-poster-v98', 'result-poster-v99'),
        ('data-result-poster="v98"', 'data-result-poster="v99"'),
        ("const VERSION = 'v98'", "const VERSION = 'v99'"),
        ("const POSTER_CLASS = 'result-poster-v98'", "const POSTER_CLASS = 'result-poster-v99'"),
        ('version: 98', 'version: 99'),
        ("test('v98 ", "test('v99 "),
    )
    for old, new in replacements:
        source = source.replace(old, new)
    source = source.replace(
        'result-poster\\.css\\?v=(?:89|91|92|93|94|95)',
        'result-poster\\.css\\?v=(?:89|91|92|93|94|95|98)',
    )
    source = source.replace(
        'result-poster-runtime\\.js\\?v=(?:89|91|92|93|94|95)',
        'result-poster-runtime\\.js\\?v=(?:89|91|92|93|94|95|98)',
    )
    source = source.replace(
        'result-poster-v(?:89|91|92|93|94|95)',
        'result-poster-v(?:89|91|92|93|94|95|98)',
    )
    path.write_text(source, encoding='utf-8')

ownership_test = ROOT / 'tests/result-source-ownership.test.mjs'
ownership = ownership_test.read_text(encoding='utf-8')
if "readRoot('screens.css')" not in ownership:
    ownership = ownership.replace(
        "  const css = readRoot('result-poster.css');",
        "  const css = readRoot('result-poster.css');\n  const screens = readRoot('screens.css');",
        1,
    )
    ownership = ownership.replace(
        "  assert.doesNotMatch(css, /result-badge::after|content:\\s*'SMAŽKA FAKTOR'/);",
        "  assert.doesNotMatch(css, /result-badge::after|content:\\s*'SMAŽKA FAKTOR'/);\n  assert.doesNotMatch(screens, /body\\.result-in-frame[^,{]*\\.effect-label/);",
        1,
    )
ownership_test.write_text(ownership, encoding='utf-8')

# Strengthen real WebKit checks so a narrow pill can never pass again.
e2e_path = ROOT / 'tests/e2e/mobile-result.spec.mjs'
e2e = e2e_path.read_text(encoding='utf-8')
old_assertions = """  expect(scoreBox.x).toBeGreaterThanOrEqual(10);
  expect(scoreBox.x + scoreBox.width).toBeLessThanOrEqual(viewport.width - 10 + 1);
  expect(badgeBox.y + badgeBox.height).toBeLessThan(scoreBox.y);
"""
new_assertions = """  const scoreStyle = await score.evaluate((node) => {
    const style = getComputedStyle(node);
    return {
      position: style.position,
      top: style.top,
      right: style.right,
      left: style.left,
      borderTopLeftRadius: Number.parseFloat(style.borderTopLeftRadius)
    };
  });

  expect(scoreBox.x).toBeGreaterThanOrEqual(10);
  expect(scoreBox.x + scoreBox.width).toBeLessThanOrEqual(viewport.width - 10 + 1);
  expect(scoreBox.width).toBeGreaterThanOrEqual(viewport.width * 0.88);
  expect(Math.abs(scoreBox.x + scoreBox.width / 2 - viewport.width / 2)).toBeLessThanOrEqual(2);
  expect(scoreStyle.position).toBe('relative');
  expect(scoreStyle.top).toBe('auto');
  expect(scoreStyle.right).toBe('auto');
  expect(scoreStyle.left).toBe('auto');
  expect(scoreStyle.borderTopLeftRadius).toBeLessThanOrEqual(40);
  expect(badgeBox.y + badgeBox.height).toBeLessThan(scoreBox.y);
"""
if e2e.count(old_assertions) != 1:
    raise RuntimeError('Could not find the WebKit score geometry assertion block')
e2e = e2e.replace(old_assertions, new_assertions, 1)
e2e_path.write_text(e2e, encoding='utf-8')

print(f'Removed {len(removed_selectors)} obsolete screens.css score selectors and prepared v99.')
for selector in removed_selectors:
    print(f'  - {selector}')

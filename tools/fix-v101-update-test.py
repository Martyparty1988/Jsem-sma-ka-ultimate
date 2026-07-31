from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
for test_path in (ROOT / 'tests').glob('*.test.mjs'):
    text = test_path.read_text(encoding='utf-8')
    text = text.replace('__smazka-update-state-v100', '__smazka-update-state-v101')
    test_path.write_text(text, encoding='utf-8')

print('Aligned update-state test contract with v101.')

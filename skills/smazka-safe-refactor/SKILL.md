# Skill: Smažka safe refactor

## Goal

Replace obsolete ownership and cascade hacks instead of stacking another patch on top.

## Workflow

1. Start from current `main`; never rely on historical line numbers.
2. Search all writers of the affected class, text, attribute and DOM node.
3. Choose one authoritative owner and delete or neutralize competing writers.
4. Prefer source fixes over observers, timeout repairs, inline `!important`, and duplicated selectors.
5. Keep changes narrow: no redesign, no verdict-copy edits, no biometric changes.
6. Add a regression contract that would fail if the removed writer or layout hack returns.
7. Run syntax checks, all Node tests, WebKit mobile tests, and inspect the final diff.
8. Merge only when GitHub Actions and Vercel are green; then verify the production commit, not only the preview branch.

## Release checklist

- response JSON files untouched
- no retired version selectors or cache URLs
- no generated semantic CSS text
- no post-render score relocation
- app-shell URLs match HTML
- 44×44 close target
- 393×852 and 393×700 WebKit checks pass
- production Vercel deployment is green

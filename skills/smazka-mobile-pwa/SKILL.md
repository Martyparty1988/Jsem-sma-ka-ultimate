# Skill: Smažka mobile PWA layout

## Goal

Build a stable iPhone result screen without changing verdict logic, biometric calculations, satire, or response packs.

## Required method

1. Map ownership before editing: render source, state runtime, CSS selector, service-worker URL, and test.
2. Put semantic labels and final DOM order in the renderer. Do not create visible labels with `content:` and do not relocate structural nodes after render.
3. Use native `<dialog>.showModal()` as the modal/top-layer owner. Style `::backdrop`; do not simulate additional competing modal layers.
4. For mobile height, prefer `100dvh` with a safe fallback and `env(safe-area-inset-*)`. Remember that dynamic viewport units resize with browser chrome.
5. Keep fixed photo/background layers independent from content flow. Score, title, description and actions belong to one normal-flow grid.
6. Verify touch targets are at least 44×44 CSS px and that no horizontal overflow exists.
7. Test WebKit at 393×852 and 393×700. Save screenshots or traces on failure.
8. Bump the PWA cache and every changed asset URL together; stale URLs are a failed release.

## Primary references

- WebKit: New viewport units in Safari 15.4 — https://webkit.org/blog/12445/new-webkit-features-in-safari-15-4/
- MDN: dynamic viewport lengths — https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Values/length
- MDN: `<dialog>` and `showModal()` — https://developer.mozilla.org/en-US/docs/Web/API/HTMLDialogElement/showModal
- Playwright: mobile emulation — https://playwright.dev/docs/emulation
- Playwright: visual comparisons — https://playwright.dev/docs/test-snapshots

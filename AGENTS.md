# Jsem Smažka Ultimate — agent rules

Read these project skills before editing production UI or PWA code:

- `skills/smazka-mobile-pwa/SKILL.md`
- `skills/smazka-safe-refactor/SKILL.md`

Hard rules:

1. Never edit `responses.json`, `responses-hard.json`, or `responses-pernik.json` unless the user explicitly asks to change app copy.
2. Keep runtime dependency-free and offline-first. Development-only test dependencies are allowed.
3. One element has one owner: semantic text and DOM order come from render source; CSS owns presentation; small runtime modules own state only.
4. Never repair layout by repeatedly moving nodes after render, recursive animation-frame settling, delayed timeouts, or generated CSS text.
5. Every modified production asset must receive a matching query-string version and service-worker app-shell entry.
6. Before merge, run Node contracts plus WebKit mobile checks at 393×852 and 393×700.

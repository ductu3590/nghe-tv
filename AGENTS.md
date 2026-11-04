# Working on Nghe

Nghe is a personal-use Samsung Tizen TV audio app. Read README.md and docs/HUONG-DAN.md first.

- Keep it light and minimal: no server, no database, no re-hosting of audio. The TV reads every source directly;
  only `app/sources.json` lives on GitHub. Small caches and listening progress stay in the TV's localStorage.
- Never register or intercept Home, Power, Source or brand hotkeys. Register only media keys that
  `tizen.tvinputdevice.getSupportedKeys()` reports. Never hard-code key codes.
- App and probe JS must stay ES5 (Tizen 6.5 browser). Never use innerHTML; keep the strict CSP in both pages.
- Animate only transform and opacity; respect prefers-reduced-motion.
- Do not spoof user agents, referers or cookies, and do not try to get around bot checks of any source.
  If a source blocks plain requests, report it instead.
- The book sites (AudioAZ, Sách Nói Việt Nam) are the owner's personal choice; keep their adapters isolated in
  `app/feeds.js` and expect them to break. Do not add new unlicensed sources on your own.
- Every source change: `npm run sync`, `npm test`, `python -m unittest discover -s tests`.
- For every code change: add or update tests, run them, and commit verified changes. Do not claim TV behaviour
  that has not been checked on the owner's TV (QA55LS03BAKXXV, Tizen 6.5); record results in docs/HUONG-DAN.md.
- Keep certificates, signed packages and private notes out of git (`.local/`, `output/`, `*.wgt`, `*.p12`).

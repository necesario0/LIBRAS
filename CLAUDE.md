## Agent skills

### Issue tracker

Issues live in GitHub Issues for `necesario0/LIBRAS` (via the `gh` CLI). See `docs/agents/issue-tracker.md`.

### Triage labels

Default vocabulary: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `GLOSSARY.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.

## Design source

UI designs live in Figma: file `LIBRAS-STICKER-SHEET`, key `EOIAoD0EVDSadk1fPbJlG6` (https://www.figma.com/design/EOIAoD0EVDSadk1fPbJlG6/LIBRAS-STICKER-SHEET).

- Current scope is **mobile first**. Build from the page `LIBRAS HIGH FID FOR MOBILE` (node `119:894`). The admin page `LIBRAS ADMIN HIGH FID` (node `1057:7788`) and any web module are out of scope until mobile is done.
- `docs/design/figma-screen-inventory.md` maps each mobile flow to node IDs. Read it first, then fetch one frame at a time with the Figma MCP `get_design_context` or `get_screenshot`. Never call `get_metadata` on the whole mobile page (about 1 MB).
- Only a few Figma variables exist (Montserrat type styles, `#000000`). Colors, spacing and radii come back as raw values, so reuse tokens already in the code rather than copying raw values per screen.
- Do not use frames `iPhone 17 - 392` to `396` (non-phone sizes, excluded by the project owner). The inventory lists their IDs.
- Account types used across the design: UMAK Student, Faculty, NTP / Employee, Visitor, Alumni.

## Writing

Before finishing docs, ADRs, `GLOSSARY.md`, READMEs, PR bodies and commit messages, run the `unslop` skill on the prose. Do not run it on code, tables or algorithm names. Where `unslop` bans a hyphen used as a dash, still use a plain "-": the global rule against em dashes wins.

# Optional legacy location catalog

The current workflow embeds locations directly in `data/competitions/*.json`.
This directory remains supported only for reusable legacy location files that a
competition references through `locationIds`.

For new work, copy `data/templates/competition.template.json` instead. In either
format, store a full Google Street View URL and do not type coordinates manually.

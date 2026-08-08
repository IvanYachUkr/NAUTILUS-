# Data workspace

The editable inputs and generated outputs are deliberately separated:

- `competitions/`: one JSON per OpenGuessr setup; full Street View URLs are the
  source of ground truth and round order.
- `results/`: model hypotheses, final predictions, cues, and human ratings.
- `recordings/inbox/`: one automatic extension export per completed round.
- `recordings/sessions/`: progress manifest for a complete competition run.
- `generated/`: rebuildable coordinates, browser data, indexes, and paste-ready
  TXT files. Do not edit these by hand.

Run `npm run data:build` after changing source files. `npm start` performs the
same build automatically before serving the website and collector.

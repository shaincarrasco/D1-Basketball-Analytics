# Deuce — project log

## 2026-11-16 — v1 built (Swarm run)

Goal: a free, from-scratch alternative to TennisBrain.com (£19.99/mo), centred on the Match Brief (per-player upsides
and downsides) and an honest backtest.

Built by a Commander plus three builders (engine, brief, app) working from `CONTRACT.md`, then an independent code review
and one fix round per builder.

**Result (out-of-sample, walk-forward, 19,536 ATP/WTA matches, Jan 2025 – Nov 2026):** 65.0% picked right,
Brier 0.216 vs 0.224 for pure Elo and 0.25 for a coin flip. Beats Elo in all three splits; calibration close to the
diagonal. Betting P&L vs closing odds is implemented but needs the free tennis-data.co.uk import on the Mac.

**Tests:** 198 passing (engine 58, brief 81, app 59).

**Key decisions**
- Data: ESPN public scoreboard (ATP/WTA tour + qualifying + WTA 125, 2023→now). Sackmann's GitHub data was unreachable
  and ends at 2024 anyway. No Challenger/ITF yet.
- Model: Elo + surface Elo + TennisBrain-style attributes (Games Won and Tiebreaks replace Serve/Return: ESPN has no
  serve stats), logistic vs LightGBM picked per split, calibrated, symmetrised.
- Briefs: deterministic rules decide every verdict; a local LLM (LM Studio) may only reword, under a strict validator.
- One display-price rule for app, brief and backtest (manual > fresh Pinnacle > preferred books, never max).
- Thin history (either player < 15 matches) → no value flag anywhere, excluded from betting backtest.
- Retirements void in the betting backtest. Headline ROI fixed at the pre-set 2-point edge.

**Review findings fixed:** wrong-book price picker, stale briefs vs live predictions, odds-import marker set on failure,
±7-day odds matching window (now ±2, ambiguous skipped), LightGBM/libomp crash on stock Macs, launcher quoting/log path,
LLM number check too loose, cross-site writes to the localhost server.

**Open**
- Install on the Mac (`~/workspace/tennis-brain-free`) and Desktop launcher: blocked on folder access / Mac offline.
- First real tennis-data.co.uk import: check the match rate and column names (written from memory).
- Real LM Studio run: check how often the validator falls back to rules text.
- Challenger/ITF coverage needs another free source.
- Paper design pass skipped (Paper wasn't running); design lives in `docs/DESIGN.md`.

## Lessons
- Verify data-source reachability first: the planned primary source (Sackmann) was unreachable and stale; ESPN worked.
- Freeze a written contract (schema + JSON shapes + one shared business rule like the display price) before fanning out;
  the price-picker bug came from that rule being unspecified.
- Ask the reviewer specifically about look-ahead leakage when a backtest is the selling point.

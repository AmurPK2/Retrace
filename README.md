# RETRACE

<p align="center"><img src="assets/RETRACE.png" width="112" alt="RETRACE RT logo"></p>

A Windows desktop app for practising on real historical gold, EURAUD and NAS100 CFD charts, reviewing your decisions with local AI, and learning one candle at a time.

**[Download RETRACE for Windows](https://github.com/AmurPK2/Retrace/releases/latest)** · **[Check out the project](https://github.com/AmurPK2/Retrace)**

## Get started

1. Download the Windows ZIP from Releases and extract the whole folder somewhere you can write to.
2. Open **RETRACE.exe**. Keep the app open while its first setup finishes.
3. A small starter period of genuine XAUUSD bid/ask history downloads automatically and opens a paused $500 simulated practice account. The local chart coach prepares separately.

You do **not** need LM Studio, an AI account, an API key, model commands, or a Discord Developer Portal application. First AI setup downloads about **3.4 GB** from the model publisher and the official llama.cpp releases, checks pinned SHA-256 hashes, and starts the runtime privately. Interrupted downloads resume next time. GPU support is tried automatically, with a CPU fallback. Windows x64 is currently supported; 16 GB RAM and several GB of free disk space are recommended. CPU image reviews can take longer.

Internet is needed for initial downloads. Replay and local AI can then work offline with downloaded data. The app stays usable while AI prepares. If a provider is temporarily unavailable, setup shows the issue; Data hours and the Assistant On/Off control let you retry. No unknown prices are invented to finish setup.

## What you can do

- **Replay real ticks.** Space or Right Arrow advances one candle; P plays or pauses. Missing unverified price data pauses execution. Market breaks and historical gaps use thin dashed separators, without large empty chart spaces. Genuine price jumps remain visible.
- **See your trades.** Direction-labelled entry and exit arrows mark actual entries and exits at their execution prices. Dashed links show each trade. **Mer → Vis siste trade** finds your latest trade; **History → Show on chart** finds an earlier one. The original **Decision chart** stays available.
- **Ask the chart coach.** Reviews retrieve that exact trade's saved decision chart, original stop/target, drawings and candle evidence. Current-chart hints use the image and candle data from the visible chart window. Setup explanations normally use 100–180 words and your question's language. Mark C1/C2 explicitly when those references are ambiguous. Computed evidence replies and model fallbacks are labelled separately. Known contradictions are checked before display. Missing entry rules are reported as unclear rather than invented; a profitable result alone does not certify a setup.
- **Learn plainly.** Learning has Norwegian and English explanations. C1 is the first candle, C2 is the next finished candle, and C3 is the candle after C2. The beginner guide uses real candles from your chart, explains technical words, and walks through saving an idea before revealing its result. Open **Lær og øv** for the ten-step course, or **Bibliotek: alle seks offline-guider** for six included Norwegian guides: workflow, candles/timeframes, HTF/PO3, order risk, Fibonacci and coach feedback. They have narration, large captions, optional subtitles and fullscreen playback, and work offline.
- **Show progress in Discord.** With Discord desktop open, RETRACE automatically shows **Balance**, **Trades taken**, the RT icon and **Check out the project**. The button opens this repository. No join invitation, party details, instrument subtitle or elapsed timer is sent. Each actually filled entry counts once across open positions and all partial exits; pending and cancelled orders do not count. Sharing can be switched off in Settings; Discord's own activity/privacy preferences still apply.
- **Draw and save.** Hold **Shift** while drawing a trend line or ray, or moving one endpoint, to lock to the nearest horizontal or vertical axis. Release Shift to draw freely. Click two points or drag; Enter also finishes a pending two-point line. Lines, rays, rectangles, position plans, indicators, notes and practice sessions persist locally. Continue restores the replay paused. Export a session backup from the session menu.

This is a simulated replay workspace, with no broker order route. Balances, positions and Discord numbers are practice results. The local model can still make mistakes; its answer is not proof of a trading edge.

## Interactive RR learning in 0.5.0

**Lær og øv → RR · se og gjør** opens eight chart exercises. **Vis meg** highlights actual candles and levels; **Prøv selv** lets you click prices/candles and drag the plan before receiving factual feedback. The same frozen historical period is available on 4H, 15m and 1m. Lock a plan or Wait before revealing C3. Main replay, orders and drawings remain in place; visual attempts survive restart and session backup.

The original written course and six offline guides are still available in the adjacent tab. These are RR building-block exercises with explicit rules, not a complete verified RR/CISD strategy or an AI accuracy certification. See [0.5.0 behavior and limits](docs/RELEASE-0.5.0.md).

## Clear chart and learning workflow in 0.4.0

Right-click the chart and choose **New order draft here**. ENTRY, SL and TP move independently; invalid geometry stays visible until corrected. **Place order** confirms the simulator order. Change size on the draft or pending line; filled quantities remain execution history. **Add entry · same setup** keeps a shared setup and stop while allowing a separate entry/target. Combined planned risk counts each entry once.

Use **Tegninger** to name, hide, lock or delete drawings; undo restores deletion. Time/price anchors persist across 4H, 1H, 15m, 5m and 1m. Fibonacci offers editable levels, labels, colours, line styles, fills, reversal and saved presets.

**4H-candle** shows one developing candle on the **same price scale as the chart**. Its height follows actual OHLC and price zoom; its width is configurable. It is placed to the right of price history. It can be small early in a period because little price movement has occurred. **Tilpass** changes width, colours, count and timeframe. **Vis hele 4H-candlen** explicitly fits the main price scale to its range; ordinary order/panel actions preserve the viewport. Countdown follows replay time, and unknown gaps never become invented candles.

**Lær og øv** opens one beginner path with ten steps, relevant videos and retained attempts. **Hva gjør knappene?** explains each primary action, drawing tool and shortcut. **Mer** groups secondary tools with descriptions. **Vurder oppsettet** sends a current-chart assessment with one click.

**Lær og øv** works in an ordinary session. Lock the answer before revealing later prices. Attempted, completed, factual checks and demonstrated understanding are separate; reveal, read markers and profit cannot grant mastery. Local AI supplies criterion explanations with verified answer quotes and evidence references. Invalid claims are repaired once or replaced with labelled factual feedback. Existing v2 answers and RR study history remain readable without becoming new passes. Stopping or interrupting AI preserves the answer and factual checks.

General free chart-coach reasoning remains experimental: a strict four-case holdout scored 0/4, and the automatic validator missed one materially incorrect response. Computed explanations and fallbacks are labelled separately. See [0.4.0 changes and limits](docs/RELEASE-0.4.0.md).

**XAUUSD, EURAUD and NAS100 CFD use distinct real tick feeds and specifications.** EURAUD practice uses an AUD-denominated account; NAS100 uses CFD units and a USD account. NQ has been removed from the selector and command choices. See [data and execution assumptions](docs/DATA.md).

The 4H source example is PO3, separate from the C1/C2/C3 exercises. See [source timestamps and HTF boundaries](docs/HTF-SOURCES.md). Local model reviews remain experimental: [evaluation and limits](docs/COACH-EVALUATION.md).

## Your own data and optional Telegram sources

**No personal sessions, trading records, Telegram groups, account credentials, model weights or datasets are included in this repository or release.** Each installation creates its own local `data` folder beside the app. Keep that folder when updating and back it up separately. `XAU_REPLAY_DATA` can choose a different writable location.

Use **Data hours** to download another period or import your own bid/ask CSV. Price files and AI weights are separate from session backups. The importer records source and integrity information; unavailable intervals stay explicit.

Telegram is entirely optional and starts with **zero sources**. Open **Telegram → Your sources**, enter your own Telegram Application API ID/hash, and list the channels your account already belongs to. Sign in yourself using the QR code in Telegram. RETRACE stores the API credentials and login session encrypted with your Windows account. It never borrows another app's login, joins a group, sends a message, or marks Telegram messages as read. Feed messages are separate from chart AI. Offline intervals can miss edits/deletions; the panel states that limit.

## Build from source

Install Node.js 24 LTS and Git, then:

```powershell
git clone https://github.com/AmurPK2/Retrace.git
cd Retrace
npm ci --cache .cache/npm
npm run build
npm start
```

The same automatic first-run setup runs in a source build. For development use `npm run dev`; for the portable Windows ZIP use `npm run package:zip`. `npm test` runs offline regression tests and `npm run typecheck` checks TypeScript. The Windows CI workflow builds, tests and uploads a clean portable artifact. Release executables are currently unsigned.

Source, builds, local dependencies and optional downloads can stay in the same project folder. `data`, `runtime`, `.cache`, logs, credentials and build outputs are ignored by Git. Do not publish your own `data` folder or Telegram login files.

## Components and credits

- React, Electron and TypeScript; [Lightweight Charts](https://github.com/tradingview/lightweight-charts) with its required chart attribution.
- [llama.cpp](https://github.com/ggml-org/llama.cpp) for automatic local inference and [Qwen3.5-4B GGUF](https://huggingface.co/lmstudio-community/Qwen3.5-4B-GGUF) for text and chart-image analysis. The download manifest pins versions and publisher hashes; weights are downloaded separately under their own license.
- Historical bid/ask downloads come from Dukascopy's public data feed. No historical dataset is redistributed here. Check the data provider's terms for your intended use.
- Learning retains its public source links and separates simple practice exercises from claims about a complete trading strategy. The included video guides use actual RETRACE screenshots and timed replay captures from a separate simulated demonstration session, with Norwegian narration and readable annotations. No price bars were generated or redrawn.

RETRACE source is available under the [MIT License](LICENSE). Third-party components retain their own licenses; see [THIRD_PARTY_NOTICES.txt](THIRD_PARTY_NOTICES.txt).

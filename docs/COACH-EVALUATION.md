# Local coach evaluation and practical limits

The coach receives one cutoff across quote, visible bars, drawing anchors/styles, selected C1/C2, plans and positions. HTF context is rebuilt at that cutoff. Earlier-trade review uses the saved original decision or a separately archived pending revision; the later outcome is not entry evidence. Instrument/session changes cancel outstanding requests. No chart or question is sent to a paid cloud model.

The reported bad rules — automatically using a 4H close as SL, or requiring all targets outside a candle range — have explicit regressions. Numeric claims are checked against stored/computed values, including sub-dollar instruments. Contradictions are repaired or replaced with a useful evidence explanation. The former 85-word rejection conflicted with the requested 100–180-word explanation and has been removed.

## Fixed evaluation collection

The collection uses English timeframe questions; an ambiguous Norwegian C1/C2/two-entry description; an explicitly marked real C1/C2 pair with two drawn entries; valid and invalid buy geometry under a written geometry-only rule; the two reported universal-rule errors; and a CPU-only factual candle observation. Cases distinguish rule compliance, order risk and later outcomes. Offline regressions also test no-future cutoffs, conflicting stop claims, missing data, pending edits and repeated immediate answers.

Hardware observed: Ryzen 5 9600X (6 cores / 12 threads), 32 GB RAM, Radeon RX 6700 XT with 12 GB VRAM through Vulkan. Qwen3.5-4B remains the default, 8,192 context and up to 640 reply tokens. Runtime/model downloads pin their revisions and SHA-256 digests. Automatic GPU loading and a real CPU inference were exercised; settings can disable the GPU.

The larger Qwen3.5-9B candidate was tested, not promoted. Non-thinking GPU responses took roughly 16–46 seconds and still invented requirements or needed fallback. Thinking responses took around 40–60 seconds; a CPU attempt timed out near 187 seconds. The 4B GPU sample was around 9–26 seconds; CPU observations were around 80–118 seconds. These are observed task samples, not throughput benchmarks or guaranteed response times.

Six final reference cases return in approximately 0.45–0.70 seconds because known timeframe, ambiguity, geometry and source-rule questions can be answered from computed evidence and the learning guide. **These are deterministic evidence replies, not successful model-inference benchmarks.** Their UI label says so. Broader model reviews remain experimental and may need a labelled saved-data fallback. A larger model did not reliably improve correctness on this hardware.

The checks do not prove every generated sentence correct. Geometry is not strategy validation, a good result is not a good decision, and no probability of profit is claimed. The user must define actual entry confirmation rules; missing references should be selected, not guessed. Challenge reasoning receives a bounded local-AI review in 0.3.2, with the limits described below.

First-run testing used an empty isolated profile. Pinned model/runtime downloads completed; real data downloads initially met provider throttling and then resumed to all 192 requested hourly slots. The successful resume took about 260 seconds, with a subsequent ready-state restart around 6 seconds. Total first-run time depends on network/provider availability. Replay remains usable independently of AI. Offline checks use already downloaded prices and model files.

## Challenge feedback in 0.3.2

Actual Qwen3.5-4B tests found that unconstrained tutor prose could mix scheduled periods with actual candles, praise reasoning the learner had not written, or return incomplete fields. That implementation was rejected. The shipped challenge tutor instead selects a verbatim answer excerpt and a task-appropriate coaching focus using a constrained response schema. The app verifies both selections and supplies reviewed explanation templates and its own arithmetic. Failed factual checks cannot be marked checked; open-ended checks remain unclear. The UI explicitly describes this division.

Tests cover a correct 16-period answer, an incorrect eight-period answer and a vague buy-because-green explanation. Snapshots whitelist answer-time facts and omit later outcomes, later prices and profit. Incorrect quotes, unsupported focus choices and conflicting assessments reject. Attempts and feedback survive session changes and restart; interrupted inference recovers factual feedback. This is useful tutoring, not certification of a strategy or universal factual reliability for the broader chart model.

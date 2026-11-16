# Higher-timeframe display and the source example

The original RETRACE side-candle renderer uses replay-bounded bid OHLC. From 0.3.1 the default is one large developing 4H candle (56 px wide, a 200 px price plot), rather than two closed candles beside it. The count setting still permits optional previous candles. Single-candle mode shows a waiting state when the current UTC bucket has no verified prices; it never presents an old closed candle as the current one. No TradingView indicator source was copied. Change timeframe, size, spacing, count, colours and level lines from the HTF panel. A forming candle is rebuilt only through the latest replay tick. Countdown is replay time, not wall-clock time. Incomplete history is not labelled a complete candle.

4H buckets start at 00:00, 04:00, 08:00, 12:00, 16:00 and 20:00 UTC. Display timezone/DST changes labels only. Market calendars and genuine data gaps remain separate from bucket boundaries. This differs from broker charts aligned to another server timezone; a named 4H candle may therefore differ from a screenshot on another platform.

## Verified primary video

[JackTrades — How to Use the Big Candle ICT Indicator (Full Guide)](https://www.youtube.com/watch?v=jWxR9OZDDR4) was checked using its transcript and visual examples on 15 November 2026.

- 0:34–0:44: the presenter credits Two Degrees and names High Time Frame Power of Three.
- 0:59–1:44: higher-timeframe OHLC display; 2:15–2:24 uses a 1m view for a 4H example.
- 2:30–3:19: the example interprets an initial area near the 4H open and a move below it.
- 4:11–5:21: return above the 4H **open**, local CISD confirmation, then a local stop. It does not establish the 4H close as a universal SL.
- 5:46–7:09: a prior 4H high is the illustrated objective.
- 7:27–9:31: time-of-day, wick and pre-CPI context lead the presenter to reject examples, even when a later move wins.
- 9:51–10:38: daily/weekly context appears separately.

This is an educational PO3 example, not a verified full C1/C2/C3 rule set or proven profitable system. RETRACE does not combine the variants into an invented entry strategy or automatically label phases as certain.

## Beginner guides

Six original Norwegian guides ship with the app: workflow, candles/timeframes, HTF/PO3, risk/two entries, Fibonacci and coach feedback. Images and replay sequences come from an isolated RETRACE demonstration session with real historical ticks. Narration is original, with Norwegian synthetic speech and optional sentence captions. No private sessions, Telegram sources, charts from the creator's account or copied third-party video are included.

Fibonacci defaults are measurement/display suggestions, not sourced profitability rules. C1/C2 exercises check candle relationships and recorded risk plans separately from the PO3 source example. The in-app source button opens only the fixed primary video URL; it is not an arbitrary browser-navigation endpoint.

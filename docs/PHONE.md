# RETRACE phone journal

The phone companion is a lightweight, read-only journal: balance, equity, open P/L, closed trade results, performance, open/pending trades and saved notes. It is a different interface from the desktop terminal. It has no AI, chart/replay engine, lessons, order entry, imports or market-data downloads. The phone server exposes only a read-only journal projection and the exact phone build dependencies; desktop bundles, videos and data files are unavailable through it.

## Connect and install

In RETRACE on Windows, choose **Mer → Phone app → Enable private phone access**. Connect the separate **retrace-phone** device to the same Tailscale account as your phone. Open the displayed HTTPS address with Tailscale connected. iPhone: Safari → Share → Add to Home Screen. Android: browser menu → Install app.

The PC must be awake and RETRACE running. Access stops when RETRACE closes. Re-enable it after reopening. For an explicitly started hidden journal session, run `RETRACE.exe --phone-journal`; this starts phone access with the saved device identity and skips automatic AI/data setup. No Windows startup task is added. Opening RETRACE normally restores its desktop interface. This does not start Aurum or any paused Trading service.

## What the values mean

These are simulated RETRACE replay accounts, not broker/live-account balances. Balance, equity and open P/L use the existing desktop broker calculations at the displayed replay time. The balance curve follows actual closed fills. A partially closed position remains open and is not counted as a completed trade. History groups fills by the original position and shows entry/exit, initial protection, realized R where recorded, execution reasons, tags and notes.

Use the Session selector to browse older saved journals. It does not switch the PC session, advance replay or edit orders. Older sessions show their saved checkpoint; the active session reflects the running PC replay. Manage trades and edit notes in the desktop app.

## Privacy and reconnecting

An official Tailscale tsnet gateway runs only for RETRACE, checks the requesting user's identity on every request and accepts only its owner's identity. No public tunnel, Funnel, exit node or subnet route is created. Device credentials stay in RETRACE's private data directory, outside the release. Do not tag the node with a shared service identity. Tailnet ACLs still apply.

Tailscale HTTPS certificates disclose the generated device DNS name in public certificate-transparency logs. Session content stays private. Telegram credentials, AI settings, filesystem paths, chat, screenshots, drawings and learning data are excluded from the journal projection. Every mutation endpoint is unavailable.

Only generic reconnect instructions are cached offline. Account/journal responses use no-store. An already displayed snapshot is labelled offline after disconnection; it is never used to execute anything. If loading fails, check Tailscale on your phone, the PC network/awake state and RETRACE phone access, then tap Try again.

## Build

Node 24 and Go 1.27.4: `npm ci`, `npm run phone:build`, `npm run package:zip`. Gateway dependency versions/checksums and license notices are included. UI acceptance uses a separate historical demo database; never use owner data for fixtures. Local browser tests do not replace verification on the actual phone after enrollment.

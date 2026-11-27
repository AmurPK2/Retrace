# RETRACE on your phone

RETRACE 0.7.0 includes an installable phone web app. It uses the PC's replay engine and local coach. The PC must be awake with RETRACE open. It is not a native App Store application and does not run the AI model on the phone.

## Connect once

1. Open RETRACE on Windows. Choose **Mer → Phone app → Enable private phone access**.
2. Sign the new **retrace-phone** device into the same Tailscale account as your phone. RETRACE opens only Tailscale's official sign-in URL. Enable MagicDNS and HTTPS in your tailnet if Tailscale asks; RETRACE does not change those account settings.
3. With Tailscale connected on your phone, open the HTTPS address shown in RETRACE.
4. iPhone: Safari → Share → Add to Home Screen. Android: browser menu → Install app.

Phone access stops when RETRACE closes. Reopen RETRACE and enable it again to reconnect using the saved private device identity. It adds no Windows startup task or system VPN service. It never starts Aurum or the paused trading project.

## Use it

**Chart** has separate phone zoom, timeframe, drawing tools, the current 4H candle and replay controls. **Trade** places market practice orders and edits protection; these are simulated orders. Existing pending orders appear and can be cancelled or moved on the chart. **Coach** uses the phone's chart timeframe, screenshot and drawings with the PC's local model; enable/configure that model on the PC. **Learn** shares the original-recording RR course, touch exercises, feedback and saved attempts. **Journal** shows closed replay trades.

Session, replay time, drawings, practice orders, chat and course progress are shared with the desktop. Opening another session on the phone switches the active PC session too. Pause replay before editing or asking the coach. A stale session/cursor or concurrent drawing edit is rejected. Never resubmit an uncertain order until you refresh and check positions.

The current candle has not closed. A fresh 4H bucket can appear as a flat line until its price changes. Its height follows the chart's price scale.

## Privacy and reconnecting

The gateway runs in its own userspace Tailscale node. It checks the requesting user's Tailscale identity on every request and accepts only the node owner's identity. No Funnel, public tunnel, port-forwarding, exit node or subnet route is created. Do not tag this node with a shared service identity. Tailnet ACLs still apply.

Tailscale HTTPS uses certificates whose generated DNS name appears in public certificate-transparency logs. This exposes the device name/domain, not chart/session content. Device state and the randomly generated loopback bridge secret stay in RETRACE's private data directory and are excluded from the public release. Telegram credentials, arbitrary file access, imports, storage/runtime settings and desktop shutdown are unavailable to the phone.

On disconnection, controls disable. Only a generic reconnect page is cached; quote, session, order, chat and API responses are never cached for offline execution. Check Tailscale on the phone, the PC network/awake state and RETRACE's phone panel. Authentication and HTTPS account changes require the owner. Local browser tests do not prove an actual iPhone connection; verify the displayed URL on the phone after enrollment.

## Build

Node 24 and Go 1.27.4: `npm ci`, `npm run phone:build`, `npm run package:zip`. The gateway pins tailscale.com v1.104.6 and its Go checksums. `npm run build` builds both browser entries; packaging includes the separate gateway executable and dependency license notices. For UI acceptance, `node --import tsx scripts/phone-ui-check.ts` requires the dedicated historical demo fixture described in the script; never point it at an owner database.

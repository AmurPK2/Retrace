import { createConnection, type Socket } from "node:net";
import { randomUUID } from "node:crypto";
import {
  discordActivity,
  type DiscordSettings,
} from "../src/core/discord-presence";
import type { Session } from "../src/types";

export type PresenceState = {
  state: "off" | "setup" | "waiting" | "connected" | "error";
  message: string;
};
export interface DiscordTransport {
  connect(id: string, lost: () => void): Promise<void>;
  activity(value: object | null): Promise<void>;
  close(): void;
}
// Local IPC only. No Discord token, OAuth login, bot, Gateway or remote API.
export class DiscordIPC implements DiscordTransport {
  socket: Socket | null = null;
  pending = new Map<
    string,
    {
      resolve: () => void;
      reject: (e: Error) => void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();
  async connect(id: string, lost: () => void) {
    for (let index = 0; index < 10; index++) {
      try {
        await this.pipe(index, id, lost);
        return;
      } catch {
        this.close();
      }
    }
    throw Error(
      "Open the Discord desktop app. RETRACE will reconnect automatically.",
    );
  }
  private pipe(index: number, id: string, lost: () => void) {
    return new Promise<void>((resolve, reject) => {
      const socket = createConnection(`\\\\?\\pipe\\discord-ipc-${index}`);
      this.socket = socket;
      let bytes = Buffer.alloc(0),
        ready = false;
      const timeout = setTimeout(() => {
        reject(Error("Discord handshake timed out."));
        socket.destroy();
      }, 1500);
      const fail = (e: Error) => {
        clearTimeout(timeout);
        for (const p of this.pending.values()) {
          clearTimeout(p.timer);
          p.reject(e);
        }
        this.pending.clear();
        if (ready) {
          ready = false;
          lost();
        } else reject(e);
      };
      socket.on("error", fail);
      socket.on("close", () => fail(Error("Discord disconnected.")));
      socket.on("connect", () => this.frame(0, { v: 1, client_id: id }));
      socket.on("data", (chunk) => {
        bytes = Buffer.concat([bytes, chunk]);
        while (bytes.length >= 8) {
          const opcode = bytes.readUInt32LE(0),
            length = bytes.readUInt32LE(4);
          if (length > 1024 * 1024) {
            socket.destroy(Error("Discord frame too large."));
            return;
          }
          if (bytes.length < 8 + length) return;
          const payload = bytes.subarray(8, 8 + length);
          bytes = bytes.subarray(8 + length);
          if (opcode === 3) {
            this.frame(4, payload);
            continue;
          }
          if (opcode === 2) {
            socket.destroy();
            return;
          }
          if (opcode !== 1) continue;
          try {
            const message = JSON.parse(payload.toString("utf8"));
            if (message.evt === "READY" && !ready) {
              ready = true;
              clearTimeout(timeout);
              resolve();
            }
            const pending = this.pending.get(message.nonce);
            if (pending) {
              clearTimeout(pending.timer);
              this.pending.delete(message.nonce);
              message.evt === "ERROR"
                ? pending.reject(
                    Error(
                      String(
                        message.data?.message ?? "Discord rejected activity.",
                      ),
                    ),
                  )
                : pending.resolve();
            }
          } catch {
            socket.destroy(Error("Invalid Discord frame."));
          }
        }
      });
    });
  }
  private frame(opcode: number, value: object | Buffer) {
    const payload = Buffer.isBuffer(value)
      ? value
      : Buffer.from(JSON.stringify(value));
    const header = Buffer.alloc(8);
    header.writeUInt32LE(opcode, 0);
    header.writeUInt32LE(payload.length, 4);
    if (!this.socket || this.socket.destroyed)
      throw Error("Discord is disconnected.");
    this.socket.write(Buffer.concat([header, payload]));
  }
  activity(activity: object | null) {
    return new Promise<void>((resolve, reject) => {
      const nonce = randomUUID();
      const timer = setTimeout(() => {
        this.pending.delete(nonce);
        reject(Error("Discord activity was not acknowledged."));
      }, 2000);
      this.pending.set(nonce, { resolve, reject, timer });
      try {
        this.frame(1, {
          cmd: "SET_ACTIVITY",
          args: { pid: process.pid, activity },
          nonce,
        });
      } catch (e) {
        clearTimeout(timer);
        this.pending.delete(nonce);
        reject(e);
      }
    });
  }
  close() {
    if (this.socket) {
      this.socket.removeAllListeners();
      this.socket.on("error", () => {});
      this.socket.destroy();
      this.socket = null;
    }
    for (const p of this.pending.values()) {
      clearTimeout(p.timer);
      p.reject(Error("Discord connection closed."));
    }
    this.pending.clear();
  }
}

export class DiscordPresence {
  private settings: DiscordSettings = {
    enabled: false,
    applicationId: "",
    imageKey: "retrace",
  };
  private session: Session | null = null;
  private transport: DiscordTransport | null = null;
  private connectedId = "";
  private lastPayload = "";
  private lastSent = 0;
  private nextAttempt = 0;
  private running = false;
  private stopped = false;
  private timer: ReturnType<typeof setInterval> | null = null;
  status: PresenceState = { state: "off", message: "Activity sharing is off." };
  constructor(
    private report: (state: PresenceState) => void,
    readonly startedAt = Date.now(),
    private factory: () => DiscordTransport = () => new DiscordIPC(),
    private now: () => number = Date.now,
  ) {}
  update(settings: DiscordSettings, session: Session | null) {
    this.settings = settings;
    this.session = session;
    if (!this.timer && !this.stopped) {
      this.timer = setInterval(() => void this.flush(), 1000);
      this.timer.unref();
    }
    void this.flush();
  }
  private statusIs(state: PresenceState["state"], message: string) {
    if (this.status.state !== state || this.status.message !== message) {
      this.status = { state, message };
      this.report(this.status);
    }
  }
  private async disconnect(clear: boolean) {
    const transport = this.transport;
    this.transport = null;
    this.connectedId = "";
    this.lastPayload = "";
    this.lastSent = 0;
    if (transport) {
      try {
        if (clear) await transport.activity(null);
      } catch {
      } finally {
        transport.close();
      }
    }
  }
  async flush() {
    if (this.running || this.stopped) return;
    this.running = true;
    try {
      if (!this.settings.enabled || !this.settings.applicationId) {
        await this.disconnect(true);
        this.statusIs(
          this.settings.enabled ? "setup" : "off",
          this.settings.enabled
            ? "Add your RETRACE Application ID below."
            : "Activity sharing is off.",
        );
        return;
      }
      if (this.connectedId && this.connectedId !== this.settings.applicationId)
        await this.disconnect(true);
      if (!this.transport) {
        if (this.now() < this.nextAttempt) return;
        this.statusIs(
          "waiting",
          "Connecting to the local Discord desktop app…",
        );
        const transport = this.factory();
        this.transport = transport;
        const applicationId = this.settings.applicationId;
        try {
          await transport.connect(applicationId, () => {
            if (this.transport === transport) {
              transport.close();
              this.transport = null;
              this.connectedId = "";
              this.lastPayload = "";
              this.nextAttempt = this.now() + 15000;
              this.statusIs(
                "waiting",
                "Discord is unavailable. Reconnecting automatically.",
              );
            }
          });
          if (this.stopped || this.transport !== transport) {
            transport.close();
            return;
          }
          this.connectedId = applicationId;
        } catch (error) {
          await this.disconnect(false);
          this.nextAttempt = this.now() + 15000;
          this.statusIs("waiting", String((error as Error).message));
          return;
        }
      }
      if (
        !this.settings.enabled ||
        this.connectedId !== this.settings.applicationId
      )
        return;
      const value = discordActivity(
        this.session,
        this.startedAt,
        this.settings.imageKey,
      );
      const payload = JSON.stringify(value);
      if (
        payload === this.lastPayload ||
        (this.lastSent && this.now() - this.lastSent < 15000)
      )
        return;
      await this.transport!.activity(value);
      this.lastPayload = payload;
      this.lastSent = this.now();
      this.statusIs(
        "connected",
        this.settings.imageKey
          ? "Activity sent to Discord. Your Discord privacy settings still apply."
          : "Connected. Add the logo image asset name below to show the icon.",
      );
    } catch (error) {
      await this.disconnect(false);
      this.nextAttempt = this.now() + 15000;
      this.statusIs("error", String((error as Error).message));
    } finally {
      this.running = false;
      if (
        !this.stopped &&
        (!this.settings.enabled || !this.settings.applicationId) &&
        this.transport
      )
        void this.flush();
    }
  }
  async shutdown() {
    this.stopped = true;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    // Bound shutdown independently of saving, worker cleanup and absent Discord.
    const cleanup = this.disconnect(true);
    await Promise.race([
      cleanup,
      new Promise<void>((r) => {
        const t = setTimeout(r, 500);
        t.unref();
      }),
    ]);
  }
}

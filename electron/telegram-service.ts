import { TelegramClient, Api, utils } from "teleproto";
import { StringSession } from "teleproto/sessions";
import QRCode from "qrcode";
import { createHash } from "node:crypto";
import path from "node:path";
import {
  FeedJournal,
  configureFeedGroups,
  TELEGRAM_GROUPS,
} from "./feed-journal";
import { telegramConfigSchema, type TelegramConfig } from "./telegram-config";
export class TelegramFeed {
  private client: TelegramClient | null = null;
  private journal: FeedJournal | null = null;
  private config: TelegramConfig | null = null;
  private peers = new Map<string, string>();
  private starting = false;
  private linking = false;
  private passwordResolve: ((p: string) => void) | null = null;
  private login: any = { state: "idle" };
  private status: any = {
    state: "off",
    detail: "Optional · add your own sources to connect",
    dedicated: false,
    at: Date.now(),
  };
  constructor(
    _project: string,
    private root: string,
    private changed: (v: any) => void = () => {},
  ) {}
  configure(value: unknown) {
    this.stop();
    this.config = value ? telegramConfigSchema.parse(value) : null;
    configureFeedGroups(
      Object.fromEntries(
        this.config?.sources.map((s) => [s.key, s.title]) ?? [],
      ),
    );
    this.status = {
      state: "off",
      detail: this.config
        ? "Ready to connect your sources"
        : "Optional · no Telegram sources configured",
      dedicated: false,
      at: Date.now(),
    };
    this.publish();
  }
  private db() {
    return (this.journal ??= new FeedJournal(
      path.join(this.root, "telegram-feed.sqlite"),
    ));
  }
  private publish() {
    this.changed({
      at: Date.now(),
      state: this.status.state,
      unread: this.db().unread(),
    });
  }
  private make() {
    if (!this.config)
      throw Error("Add your own Telegram API ID, API hash and sources first.");
    const client = new TelegramClient(
      new StringSession(this.config.session),
      this.config.apiId,
      this.config.apiHash,
      {
        connectionRetries: 2,
        requestRetries: 1,
        deviceModel: "RETRACE",
        appVersion: "0.2.0",
      },
    );
    client.setLogLevel("none" as any);
    this.client = client;
    return client;
  }
  start() {
    if (
      this.starting ||
      this.linking ||
      this.client ||
      !this.config?.session ||
      !this.config.sources.length
    )
      return;
    this.starting = true;
    const client = this.make();
    void (async () => {
      try {
        await client.connect();
        if (this.client !== client) {
          await client.disconnect();
          return;
        }
        if (!(await client.checkAuthorization())) throw Error("Sign in again");
        await this.observe(client);
      } catch {
        this.status = {
          state: "offline",
          detail:
            "Could not connect. Saved messages are retained. Reconnect from Telegram settings.",
          dedicated: false,
          at: Date.now(),
        };
        if (this.client === client) this.client = null;
        await client.disconnect().catch(() => {});
        this.publish();
      } finally {
        this.starting = false;
      }
    })();
  }
  private message(m: any) {
    return {
      id: Number(m.id),
      text: String(m.message ?? "").slice(0, 6000),
      time: Number(m.date) * 1000,
      editedAt: m.editDate ? Number(m.editDate) * 1000 : null,
      hasMedia: !!m.media,
      outgoing: !!m.out,
    };
  }
  private apply(group: string, changes: any[], seed = false) {
    this.db().apply({
      group,
      pts: Math.max(Date.now(), (this.db().cursors()[group] ?? 0) + 1),
      at: Date.now(),
      changes,
      seed,
    });
    this.publish();
  }
  private async observe(client: TelegramClient) {
    if (!this.config || this.client !== client) return;
    const me = await client.getMe();
    if (this.client !== client) return;
    this.db().identity(
      createHash("sha256").update(String(me.id)).digest("hex"),
    );
    const dialogs = await client.getDialogs({ limit: 500 });
    if (this.client !== client) return;
    const membership = new Set(dialogs.map((d) => String(d.id)));
    this.peers.clear();
    for (const source of this.config.sources) {
      const entity = await client.getEntity(source.peer);
      const id = utils.getPeerId(entity).toString();
      if (!membership.has(id))
        throw Error("Source must already be joined by this account");
      this.peers.set(id, source.key);
      const messages = await client.getMessages(entity, { limit: 50 });
      if (this.client !== client) return;
      this.apply(
        source.key,
        [...messages]
          .reverse()
          .map((m) => ({ kind: "seed", message: this.message(m) })),
        true,
      );
    }
    client.addEventHandler(async (update: any) => {
      if (this.client !== client) return;
      try {
        if (
          update instanceof Api.UpdateNewChannelMessage ||
          update instanceof Api.UpdateEditChannelMessage
        ) {
          const m = update.message as any;
          if (!(m instanceof Api.Message)) return;
          const group = this.peers.get(utils.getPeerId(m.peerId).toString());
          if (group)
            this.apply(group, [
              {
                kind:
                  update instanceof Api.UpdateEditChannelMessage
                    ? "edit"
                    : "new",
                message: this.message(m),
              },
            ]);
        } else if (update instanceof Api.UpdateDeleteChannelMessages) {
          const group = this.peers.get("-100" + update.channelId.toString());
          if (group)
            this.apply(
              group,
              update.messages.map((id) => ({ kind: "delete", id })),
            );
        }
      } catch {
        this.status = {
          ...this.status,
          state: "offline",
          detail:
            "An update could not be saved. Reconnect to refresh selected sources.",
        };
        this.publish();
      }
    });
    this.status = {
      state: "live",
      detail:
        "Your selected sources · local saved history. Offline intervals may miss edits or deletions.",
      dedicated: true,
      at: Date.now(),
    };
    this.publish();
  }
  link() {
    if (this.linking) return;
    this.stop();
    this.linking = true;
    const client = this.make();
    this.login = { state: "starting" };
    this.publish();
    void (async () => {
      try {
        await client.connect();
        await client.signInUserWithQrCode(
          { apiId: this.config!.apiId, apiHash: this.config!.apiHash },
          {
            qrCode: async (code) => {
              if (this.client !== client) throw Error("AUTH_USER_CANCEL");
              this.login = {
                state: "qr",
                image: await QRCode.toDataURL(
                  "tg://login?token=" + code.token.toString("base64url"),
                  { width: 240, margin: 2 },
                ),
                expiresAt: code.expires * 1000,
              };
              this.publish();
            },
            password: async () =>
              new Promise<string>((resolve) => {
                this.passwordResolve = resolve;
                this.login = { state: "password" };
                this.publish();
              }),
            onError: async () => true,
          },
        );
        if (!this.linking || this.client !== client) return;
        this.config = {
          ...this.config!,
          session: String(client.session.save()),
        };
        this.changed({ type: "persist", value: this.config });
        this.login = { state: "connected" };
        await this.observe(client);
      } catch {
        this.login = {
          state: "error",
          message: "Sign-in did not finish. Retry from this panel.",
        };
        await client.disconnect().catch(() => {});
        if (this.client === client) this.client = null;
      } finally {
        this.linking = false;
        this.publish();
      }
    })();
  }
  password(value: string) {
    if (!this.passwordResolve || value.length > 500)
      throw Error("No password prompt is active");
    const resolve = this.passwordResolve;
    this.passwordResolve = null;
    this.login = { state: "checking" };
    resolve(value);
    this.publish();
  }
  cancelLink() {
    this.linking = false;
    if (this.passwordResolve) {
      this.passwordResolve("");
      this.passwordResolve = null;
    }
    if (this.login.state !== "connected") {
      void this.client?.disconnect().catch(() => {});
      this.client = null;
    }
    this.login = { state: "idle" };
  }
  stop() {
    this.cancelLink();
    const client = this.client;
    this.client = null;
    void client?.disconnect().catch(() => {});
    this.peers.clear();
  }
  cancel() {}
  async read(group: string, before = 0) {
    this.start();
    return {
      ...this.db().snapshot(group, before),
      transport: {
        ...this.status,
        state:
          this.status.state === "live" && !this.client?.connected
            ? "offline"
            : this.status.state,
        stale: false,
      },
      login: this.login,
      configuration: {
        apiId: this.config?.apiId ?? "",
        configured: !!this.config,
        sources:
          this.config?.sources.map(({ title, peer }) => ({ title, peer })) ??
          [],
      },
    };
  }
  seen(group: string) {
    this.db().seen(group);
    this.publish();
  }
}

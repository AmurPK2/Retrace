import { randomBytes } from 'node:crypto';
import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { Server } from 'node:http';
import { startPhoneServer } from './phone-server';

export class PhoneAccess {
  private server: Server | null = null;
  private child: ChildProcess | null = null;
  private origin = '';
  private issue = '';
  constructor(private root: string, private assets: string, private gateway: string, private call: (c: any) => Promise<any>) {}
  status() {
    const directory = path.join(this.root, 'phone-private');
    let health: any = {}; let login = '';
    try { health = JSON.parse(readFileSync(path.join(directory, 'status.json'), 'utf8')); } catch {}
    if (this.child && health.url && /^https:\/\/retrace-phone(?:-\d+)?\.[a-z0-9.-]+\.ts\.net$/.test(health.url)) this.origin = health.url;
    try { login = readFileSync(path.join(directory, 'login-url.txt'), 'utf8').trim(); } catch {}
    return { running: !!this.child, url: this.child ? this.origin : '',
      login: this.child && /^https:\/\/login\.tailscale\.com\/a\/[A-Za-z0-9]+$/.test(login) ? login : '',
      state: this.child ? this.origin ? 'ready' : 'connecting' : 'off', issue:this.issue };
  }
  async start() {
    if (this.child) return this.status();
    if (!existsSync(this.gateway)) throw Error('Phone gateway is missing. Install the complete RETRACE package.');
    this.issue = ''; this.origin = '';
    const directory = path.join(this.root, 'phone-private'); mkdirSync(directory, { recursive:true });
    writeFileSync(path.join(directory, 'status.json'), '{}'); writeFileSync(path.join(directory, 'login-url.txt'), '');
    const secret = randomBytes(32).toString('hex');
    this.server = await startPhoneServer({ assets:this.assets, secret, origin:() => { this.status(); return this.origin; },
      journal: id => this.call({ type:'phone.journal', id }) });
    const address = this.server.address();
    if (!address || typeof address === 'string') throw Error('Phone listener failed.');
    const config = path.join(directory, 'bridge.json');
    writeFileSync(config, JSON.stringify({ upstream:`http://127.0.0.1:${address.port}`, secret }));
    const child = spawn(this.gateway, ['--state', directory, '--parent', String(process.pid)], { windowsHide:true, stdio:['pipe', 'ignore', 'ignore'], env: { ...process.env, TS_AUTHKEY:'', TS_CLIENT_ID:'', TS_CLIENT_SECRET:'', TS_ID_TOKEN:'', TS_AUDIENCE:'', TS_CONTROL_URL:'' } });
    this.child = child;
    child.once('error', () => { this.issue = 'Phone gateway could not start.'; void this.stop(); });
    child.once('exit', code => { if (this.child === child) { this.child = null; this.origin = ''; if (code) this.issue = 'Private connection stopped. Reconnect on this PC.'; this.server?.closeAllConnections(); this.server?.close(); this.server = null; } });
    return this.status();
  }
  async stop() {
    const child = this.child; this.child = null; this.origin = '';
    if (child) {
      const ended = new Promise<void>(resolve => child.once('exit', () => resolve()));
      child.stdin?.end(); // Gateway exits on parent pipe EOF, without a forced kill.
      await Promise.race([ended, new Promise<void>(resolve => setTimeout(resolve, 10000))]);
    }
    if (this.server) { this.server.closeAllConnections(); await new Promise<void>(resolve => this.server!.close(() => resolve())); this.server = null; }
    return this.status();
  }
}

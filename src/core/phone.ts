import { FRAMES, type AppState, type TF, type Session } from '../types';
// This is deliberately separate from the desktop IPC allowlist.
export const PHONE_COMMANDS = new Set([
  'sessions.continue', 'sessions.new', 'play', 'speed', 'step', 'order',
  'position.close', 'position.edit', 'pending.cancel', 'pending.edit',
  'drawings', 'drawing.patch', 'drawing.remove', 'drawing.undo', 'drawing.redo',
  'rrcourse.open', 'rrcourse.action', 'ai.ask', 'ai.cancel',
]);
export function phoneFrame(value: unknown): TF {
  if (typeof value !== 'string' || !Object.hasOwn(FRAMES, value)) throw Error('Unknown timeframe.');
  return value as TF;
}
export function validatePhoneCommand(c: any, s: Session | null) {
  if (!c || typeof c !== 'object' || !PHONE_COMMANDS.has(c.command?.type))
    throw Error('This command is unavailable on phone.');
  if (c.command.type === 'rrcourse.open') return;
  if ((s?.id ?? null) !== c.sessionId) throw Error('The active session changed on the PC. Refresh before continuing.');
  if (s && c.cursor !== s.broker.seq) throw Error('The replay moved. Pause it and try again.');
  if (c.command.type === 'drawings' && s && JSON.stringify(c.baseDrawings) !== JSON.stringify(s.drawings))
    throw Error('Drawings changed on another screen. Refresh before editing.');
}
export function phoneState(value: AppState, timeframe: TF): AppState {
  const state = structuredClone(value);
  if (state.session) {
    state.session.layout = { ...state.session.layout, timeframe, dual: false,
      range: undefined, secondRange: undefined, ranges: undefined, secondRanges: undefined,
      htf: { ...state.session.layout.htf, enabled: true, timeframe: '4H' } as any };
    state.session.undo = []; state.session.redo = [];
  }
  state.secondBars = [];
  state.diagnostics = { storage: '', versions: {}, errors: [] };
  state.coverage.marketDirectory = undefined;
  state.coverage.importer = { ...state.coverage.importer, current: '', error: '' };
  state.settings = { ...state.settings, url: '', runtime: '', previous: undefined };
  state.discord = undefined; state.discordStatus = undefined;
  // Provider failures can contain local paths. Keep the useful state, not raw logs.
  state.ai = { ...state.ai, message: state.ai.state === 'error' ? 'Check the coach on your PC.' : state.ai.state };
  return state;
}

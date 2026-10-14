import { randomUUID } from 'node:crypto';
import { DesktopState, validId } from './desktop-state.js';
import { launchHelper } from './desktop-process.js';
import { mkdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

export const inject = ['connection', 'webServer', 'agents', 'sessionProjections'];

export function apply(ctx) {
  if (process.platform !== 'win32' || ctx.get('profileContext')?.name !== 'desktop') return;
  try { installDesktop(ctx); }
  catch (error) { startupError(error); throw error; }
}

function startupError(error) {
  // Only our own initialization failures, with no conversation data.
  try {
    const directory = path.join(process.env.DSH_HOME || path.join(homedir(), '.dsh'), 'idol-desktop');
    mkdirSync(directory, { recursive: true });
    writeFileSync(path.join(directory, 'startup-error.log'), `${new Date().toISOString()}\n${error?.stack ?? String(error)}\n`, 'utf8');
  } catch { /* Preserve the original error if diagnostics cannot be written. */ }
}

export function installDesktop(ctx, { startHelper = launchHelper, state = new DesktopState() } = {}) {
  const agents = ctx.get('agents'), projections = ctx.get('sessionProjections');
  const sessions = new Map(), liveQuestions = new Map(), toolQuestions = new Map();
  let helper, disposed = false, publishTimer;
  const report = error => {
    try {
      const logger = typeof ctx.logger === 'function' ? ctx.logger('idol-theme') : ctx.logger;
      logger?.warn?.(String(error?.message ?? error));
    } catch {}
  };
  const safely = fn => { try { return fn(); } catch (error) { report(error); } };
  const titleOf = session => projections.stateOf(session, 'title') || '会话';
  const isRoot = agent => agents.roots().includes(agent);
  const track = agent => {
    if (!agent?.session || !isRoot(agent)) return false;
    sessions.set(agent.session.id, agent.session);
    state.track(agent.session.id, { title: titleOf(agent.session), running: agent.status === 'running' });
    return true;
  };
  const questionsOf = session => [
    ...(projections.stateOf(session, 'userQuestions')?.questions.active ?? []),
    ...[...(toolQuestions.get(session.id) ?? [])].map(callId => ({ callId })),
    ...[...liveQuestions.values()].filter(question => question.sessionId === session.id),
  ];
  const publish = () => {
    if (disposed || publishTimer) return;
    // Coalesce automatic approval decisions so they do not look like a human wait.
    publishTimer = setTimeout(() => {
      publishTimer = undefined;
      if (!disposed && state.active) safely(() => helper?.send(state.snapshot()));
    }, 25);
    publishTimer.unref();
  };
  const syncQuestions = session => { state.reconcileQuestions(session.id, questionsOf(session)); publish(); };
  const stopProjection = projections.onChanged((session, key) => {
    if (disposed || !sessions.has(session.id)) return;
    if (key === 'userQuestions') safely(() => syncQuestions(session));
    if (key === 'title') safely(() => { state.track(session.id, { title: titleOf(session) }); publish(); });
  });
  const stopEvents = [];
  const listen = (event, fn, options = {}) => stopEvents.push(ctx.on(event, fn, { global: true, ...options }));
  listen('agent/created', ({ agent }) => safely(() => { if (track(agent)) syncQuestions(agent.session); }));
  listen('agent/status', ({ agent, status }) => safely(() => {
    if (!track(agent)) return;
    state.track(agent.session.id, { running: status === 'running' }); publish();
  }));
  listen('agent/disposed', ({ agent }) => safely(() => {
    if (sessions.has(agent.id)) { state.track(agent.id, { running: false }); publish(); }
  }));
  listen('session/event', (session, event) => safely(() => {
    if (!sessions.has(session.id) && !track(agents.get(session.id))) return;
    state.observe(session.id, event);
    if (event.type === 'tool/call' && event.data.name === 'ask_user_question' && validId(event.data.callId)) {
      const calls = toolQuestions.get(session.id) ?? new Set();
      calls.add(event.data.callId); toolQuestions.set(session.id, calls);
      state.ask(session.id, event.data.callId);
    }
    if (event.type === 'tool/result') {
      toolQuestions.get(session.id)?.delete(event.data.message?.toolCallId);
      syncQuestions(session);
    }
    publish();
  }));
  // Delegate the waterfall unchanged. Session events also cover older blocking question tools.
  listen('user-questions/request', async (request, next) => {
    const agent = request.agent;
    if (!agent || !isRoot(agent) || request.signal?.aborted) return next();
    // Legacy ask_user_question has no wait.callId; its tool/call already owns the notice.
    if (!request.wait?.callId && toolQuestions.get(agent.id)?.size) return next();
    const callId = request.wait?.callId || randomUUID(), key = `${agent.id}:${callId}`;
    safely(() => {
      track(agent); liveQuestions.set(key, { sessionId: agent.id, callId });
      state.ask(agent.id, callId, request.questions?.some(question => question.intent?.kind === 'plan-review'));
      publish();
    });
    try { return await next(); }
    finally {
      liveQuestions.delete(key);
      if (!disposed) safely(() => syncQuestions(agent.session));
    }
  }, { prepend: true });

  for (const agent of agents.roots()) safely(() => {
    if (!track(agent)) return;
    const start = projections.stateOf(agent.session, 'turnBoundary')?.openTurnStartSeq;
    if (Number.isSafeInteger(start) && start >= 0) {
      const approvals = new Map(), calls = new Set();
      // Only inspect request identities in the current open turn; no chat content or old history.
      for (let seq = start; seq < agent.session.seq; seq++) {
        const event = agent.session.eventAt(seq);
        if (event?.type === 'approval/asked') approvals.set(event.data.id, event);
        if (event?.type === 'approval/decided') approvals.delete(event.data.id);
        if (event?.type === 'tool/call' && event.data.name === 'ask_user_question') calls.add(event.data.callId);
        if (event?.type === 'tool/result') calls.delete(event.data.message?.toolCallId);
      }
      toolQuestions.set(agent.id, calls);
      for (const event of approvals.values()) state.observe(agent.id, event);
    }
    syncQuestions(agent.session);
  });

  // The installed Connection.rpc getter captures its provider's shadow context.
  // Register with the explicit consuming context so webServer injection and
  // disposal belong to this plugin; authentication still uses Connection.
  ctx.get('connection').register(ctx, '/yukimi', async (endpoint, payload) => {
    if (disposed) return { ok: false, error: { code: 'yukimi/disposed', message: 'Plugin stopped', details: {} } };
    if (endpoint === 'state') return { ok: true, value: state.clientSnapshot() };
    if (endpoint === 'preferences') {
      const preferences = state.updatePreferences(payload);
      if (state.active) helper?.send({ type: 'preferences', preferences });
      return { ok: true, value: preferences };
    }
    if (endpoint === 'ack-navigation') return { ok: true, value: state.ackNavigation(payload?.requestId) };
    return { ok: false, error: { code: 'yukimi/unknown-endpoint', message: 'Unknown endpoint', details: {} } };
  });
  helper = startHelper({
    onError: report,
    onExit() { state.active = false; helper = null; },
    onMessage(message) {
      if (disposed) return;
      safely(() => {
        if (message.type === 'ready') { state.active = true; publish(); }
        if (message.type === 'preferences') { state.updatePreferences(message.preferences); publish(); }
        if (message.type === 'open-session') state.navigate(message.sessionId);
        if (message.type === 'notice-shown' && validId(message.id)) state.acknowledge(message.id);
      });
    },
  });
  const dispose = () => {
    if (disposed) return;
    disposed = true; state.active = false; clearTimeout(publishTimer);
    for (const stop of stopEvents) stop();
    stopProjection(); liveQuestions.clear(); toolQuestions.clear(); sessions.clear();
    helper?.close(); helper = null;
  };
  ctx.effect(() => dispose);
  return { state, dispose };
}

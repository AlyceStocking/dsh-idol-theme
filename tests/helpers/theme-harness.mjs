import { readFileSync } from 'node:fs';
import vm from 'node:vm';

export function loadTheme(options = {}) {
  if (typeof options === 'boolean') options = { wide: options };
  const { wide = true, rpc, workspace } = options;
  let plugin, tokens;
  const mediaListeners = new Set();
  const media = { matches: wide, addEventListener: (_, fn) => mediaListeners.add(fn), removeEventListener: (_, fn) => mediaListeners.delete(fn) };
  const disposers = [];
  const styles = new Set();
  const intervals = new Set();
  const timeouts = new Set();
  const registrations = [];
  const slots = { inject: (_, fn) => fn(), register: (spec, component) => registrations.push({ spec, component }) };
  vm.runInNewContext(readFileSync(new URL('../../lib/client.js', import.meta.url), 'utf8'), {
    AbortController,
    window: { matchMedia: () => media, __ModuleLoader__: { load: entry => { plugin = entry.factory(() => ({ createElement: (type, props, ...children) => ({ type, props, children }), Fragment: 'fragment' })); } } },
    document: {
      createElement: () => { const tag = { dataset: {}, remove: () => styles.delete(tag) }; return tag; },
      head: { appendChild: tag => styles.add(tag) },
    },
  });
  const services = {
    theme: { overrideTokens: (_, value) => { tokens = value; return () => { tokens = undefined; }; } },
    slots,
    connection: rpc ? { rpc } : undefined,
    uiWorkspace: workspace,
  };
  plugin.apply({
    get: key => services[key],
    effect: fn => { const dispose = fn(); if (typeof dispose === 'function') disposers.push(dispose); },
    interval: fn => { intervals.add(fn); return () => intervals.delete(fn); },
    timeout: (fn, delay) => { const timer = { fn, delay }; timeouts.add(timer); return () => timeouts.delete(timer); },
  });
  const input = registrations[0].spec.inject();
  return {
    tokens, styles, registrations, mediaListeners, intervals, timeouts, services,
    preferences: input.hooks.preferences,
    update: input.update,
    render: () => registrations[0].component({ usePreferences: selector => selector(input.hooks.preferences.getSnapshot()), update: input.update }),
    tick: async () => { await Promise.all([...intervals].map(fn => fn())); await new Promise(resolve => setImmediate(resolve)); },
    fireTimeouts: async () => { [...timeouts].forEach(timer => { timeouts.delete(timer); timer.fn(); }); await new Promise(resolve => setImmediate(resolve)); },
    resize: wide => { media.matches = wide; mediaListeners.forEach(fn => fn()); },
    dispose: () => disposers.reverse().splice(0).forEach(fn => fn()),
    currentTokens: () => tokens,
  };
}

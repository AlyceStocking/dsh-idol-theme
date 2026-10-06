import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadTheme } from './helpers/theme-harness.mjs';

const rgb = hex => hex.slice(1).match(/../g).map(v => parseInt(v, 16));
const luminance = c => c.map(v => v / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4).reduce((s,v,i) => s + v * [.2126,.7152,.0722][i], 0);
const contrast = (a,b) => (Math.max(luminance(a),luminance(b)) + .05) / (Math.min(luminance(a),luminance(b)) + .05);

test('reading surfaces keep primary and secondary text above 4.5:1 over any background image', () => {
  const { tokens } = loadTheme();
  for (const mode of ['light', 'dark']) {
    for (const token of ['--yukimi-reading-surface', '--dsw-specific-sidebar-fill', '--dsw-specific-bubble', '--dsw-alias-markdown-code-block']) {
      const value = tokens[token][mode];
      for (const image of [0, 255]) {
        const parts = value.startsWith('#') ? [...rgb(value), 1] : value.match(/[\d.]+/g).map(Number);
        const bg = parts.slice(0,3).map(v => v * parts[3] + image * (1-parts[3]));
        for (const label of ['primary','secondary']) {
          assert.ok(contrast(rgb(tokens[`--dsw-alias-label-${label}`][mode]), bg) >= 4.5, `${mode} ${token} ${label}`);
        }
      }
    }
  }
});

test('disposing plugin removes its styles and token overrides', () => {
  const theme = loadTheme();
  assert.equal(theme.styles.size, 1);
  theme.dispose();
  assert.equal(theme.styles.size, 0);
  assert.equal(theme.currentTokens(), undefined);
});

test('page tint leaves the background art visible while content has its own reading surface', () => {
  const { tokens } = loadTheme();
  for (const mode of ['light','dark']) {
    const alpha = Number(tokens['--dsw-alias-bg-base'][mode].match(/[\d.]+/g)[3]);
    assert.ok(alpha <= 0.15);
    assert.ok(tokens['--yukimi-reading-surface'][mode]);
  }
});


test('only card and signature hide on compact screens; the floating pet keeps its identity', () => {
  const theme=loadTheme(true);
  assert.deepEqual(theme.registrations.map(r=>r.spec.name), ['shell.overlay']);
  const {spec,component}=theme.registrations[0];
  const input=spec.inject();
  const render=()=>component({usePreferences: selector=>selector(input.hooks.preferences.getSnapshot()), update:input.update});
  assert.equal(render().children[2].props.show,false);
  input.update({showMobamas:true});
  const wide=render();
  assert.equal(wide.children[0].props.show,true);
  assert.equal(wide.children[2].props.show,true);
  theme.resize(false);
  const compact=render();
  assert.equal(compact.children[0].props.show,false);
  assert.equal(compact.children[2].props.show,false);
  assert.equal(compact.children[1].type,wide.children[1].type);
  assert.equal(compact.children[1].props.hidden,undefined);
  input.update({showSign:false});
  theme.resize(true);
  assert.equal(render().children[0].props.show,false);
  assert.equal(render().children[2].props.show,true);
  theme.dispose();
  assert.equal(theme.mediaListeners.size,0);
});

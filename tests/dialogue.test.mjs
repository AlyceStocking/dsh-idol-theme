import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCommonDialogue, splitTopLevel } from '../scripts/audit-dialogue.mjs';
import { parseCardDialogue } from '../scripts/audit-serifu.mjs';

const line = (japanese, chinese) => '|' + japanese + '<br>{{font|color=#4D6BFE|size=12px|<u>' + chinese + '</u>}}';
const page = (...parameters) => '<includeonly>{{台词语音表格/Common|AITranslated=1|idol=Yukimi|Audio=1\n' + parameters.join('\n') + '\n}}</includeonly>';

test('the common voice table yields the Chinese translation of each tap line', () => {
  const lines = parseCommonDialogue(page(
    line('……ふあ……朝……', '……呼啊……早上……有点……困……'),
    line('お昼……ランチ……', '午饭……午餐……是什么呢……好期待……'),
  ));
  assert.deepEqual(lines, ['……呼啊……早上……有点……困……', '午饭……午餐……是什么呢……好期待……']);
});

test('the player name placeholder becomes the producer and furniture text is dropped', () => {
  const lines = parseCommonDialogue(page(
    line('……もう……眠い……{{UserName}}……おんぶ……', '……已经……困了……{{UserName}}……背我……'),
    line('(家具名)の使い心地', '(家具名)的使用感…变好了…'),
    line('……約束……だからね', '……因为……约好了呢'),
  ));
  assert.deepEqual(lines, ['……已经……困了……制作人……背我……', '……因为……约好了呢']);
});

test('item and business parameters after the room dialogue are not collected', () => {
  const room = Array.from({ length: 20 }, (_, index) => line('セリフ' + index, '台词' + index + '号'));
  const lines = parseCommonDialogue(page(...room));
  assert.equal(lines.length, 15);
  assert.equal(lines.at(-1), '台词14号');
});

test('pages without the common voice table and duplicate lines stay harmless', () => {
  assert.deepEqual(parseCommonDialogue('{{Other|a}}'), []);
  assert.deepEqual(parseCommonDialogue(page(line('あ', '同一句'), line('い', '同一句'))), ['同一句']);
});

test('nested templates stay inside one parameter', () => {
  assert.deepEqual(splitTopLevel('a|{{b|c=d}}|e', '|'), ['a', '{{b|c=d}}', 'e']);
});
test('per-outfit dialogue is split by card block and keeps only the Chinese line', () => {
  const source = '<div id="allSerifuList"><div class="serifu" id="cardserifu13"><ul id="cardserifulist13"><li>紧紧……握住……</li><!--<li>ぎゅって……</li>--><li>{0}……拍照……</li></ul></div><div class="serifu" id="cardserifu1"><ul id="cardserifulist1"><li>早上好。</li></ul></div></div>';
  assert.deepEqual(parseCardDialogue(source), { 13: ['紧紧……握住……', '制作人……拍照……'], 1: ['早上好。'] });
});

test('per-outfit dialogue caps the list per card and drops markup or oversized lines', () => {
  const items = Array.from({ length: 9 }, (_, index) => '<li>台词' + index + '号</li>').join('') + '<li>{{模板}}</li><li>' + '长'.repeat(60) + '</li>';
  const blocks = parseCardDialogue('<div class="serifu" id="cardserifu2"><ul id="cardserifulist2">' + items + '</ul></div>');
  assert.equal(blocks['2'].length, 5);
  assert.equal(blocks['2'][0], '台词0号');
});

const assert = require('node:assert');
const { buildGems } = require('../transform.js');

const skillGems = ['Arc', 'Fireball', 'Added Cold Damage Support', 'Cruelty Support'];
const questRows = [
  { gem: 'Arc', act: '1', quest: "The Siren's Cadence", classes: 'Witch' },
  { gem: 'Added Cold Damage Support', act: '1', quest: 'The Caged Brute', classes: 'Ranger,Shadow,Scion' },
  { gem: 'Agate Amulet', act: '6', quest: "Bestel's Epic", classes: '' }, // non-gem: must be dropped
];
const vendorRows = [
  { gem: 'Fireball', act: '1', npc: 'Nessa', classes: 'Marauder,Scion,Shadow,Templar,Witch' },
  { gem: 'Fireball', act: '3', npc: 'Siosa', classes: '' },
  { gem: 'Fireball', act: '6', npc: 'Lilly Roth', classes: '' },
  { gem: 'Arc', act: '1', npc: 'Nessa', classes: 'Witch' },
  { gem: 'Arc', act: '3', npc: 'Siosa', classes: '' },
];

const gems = buildGems(skillGems, questRows, vendorRows);

// non-gem quest reward dropped
assert.ok(!('Agate Amulet' in gems), 'Agate Amulet must be filtered out');

// Fireball: no free, buy from Nessa act1 (specific classes), allBy Siosa act3
assert.strictEqual(gems.Fireball.free, undefined);
assert.deepStrictEqual(gems.Fireball.buy, { act: 1, vendor: 'Nessa', classes: ['Marauder', 'Scion', 'Shadow', 'Templar', 'Witch'] });
assert.deepStrictEqual(gems.Fireball.allBy, { act: 3, vendor: 'Siosa' });

// Arc: free from quest for Witch; buy Nessa act1
assert.deepStrictEqual(gems.Arc.free, { act: 1, quest: "The Siren's Cadence", classes: ['Witch'] });
assert.deepStrictEqual(gems.Arc.buy, { act: 1, vendor: 'Nessa', classes: ['Witch'] });
assert.deepStrictEqual(gems.Arc.allBy, { act: 3, vendor: 'Siosa' });

// Added Cold Damage Support: free reward, but no vendor rows → buy undefined
assert.deepStrictEqual(gems['Added Cold Damage Support'].free, { act: 1, quest: 'The Caged Brute', classes: ['Ranger', 'Shadow', 'Scion'] });
assert.strictEqual(gems['Added Cold Damage Support'].buy, undefined);

// Cruelty Support: known skill gem with no quest/vendor row → empty entry (recognized, drop-only)
assert.deepStrictEqual(gems['Cruelty Support'], {});

console.log('transform.test OK');

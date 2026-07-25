const assert = require('node:assert');
const { formatTooltip } = require('../format.js');

const arc = {
  free: { act: 1, quest: "The Siren's Cadence", classes: ['Witch'] },
  buy: { act: 1, vendor: 'Nessa', classes: ['Witch'] },
  allBy: { act: 3, vendor: 'Siosa' },
};
assert.deepStrictEqual(formatTooltip('Arc', arc), [
  'Arc',
  "Free: Act 1 'The Siren's Cadence' (Witch)",
  'Earliest buy: Act 1, Nessa',
  'All classes by Act 3 (Siosa)',
]);

const fireball = {
  buy: { act: 1, vendor: 'Nessa', classes: ['Marauder', 'Scion', 'Shadow', 'Templar', 'Witch'] },
  allBy: { act: 3, vendor: 'Siosa' },
};
assert.deepStrictEqual(formatTooltip('Fireball', fireball), [
  'Fireball',
  'Earliest buy: Act 1, Nessa',
  'All classes by Act 3 (Siosa)',
]);

// buy already all classes → no "All classes by" line
const allBuy = { buy: { act: 6, vendor: 'Lilly Roth', classes: [] } };
assert.deepStrictEqual(formatTooltip('X', allBuy), ['X', 'Earliest buy: Act 6, Lilly Roth (all classes)']);

// free but no vendor
const freeOnly = { free: { act: 1, quest: 'The Caged Brute', classes: ['Ranger', 'Shadow', 'Scion'] } };
assert.deepStrictEqual(formatTooltip('Added Cold Damage Support', freeOnly), [
  'Added Cold Damage Support',
  "Free: Act 1 'The Caged Brute' (Ranger, Shadow, Scion)",
]);

// empty entry (recognized gem, no listed source)
assert.deepStrictEqual(formatTooltip('Cruelty Support', {}), [
  'Cruelty Support',
  'No quest or vendor source listed (likely drop-only)',
]);

console.log('format.test OK');

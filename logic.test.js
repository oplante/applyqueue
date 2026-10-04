'use strict';
var assert = require('assert');
var AQ = require('./logic.js');

function lineById(state, id) {
  for (var p = 0; p < state.packages.length; p++) {
    var lines = state.packages[p].lines;
    for (var i = 0; i < lines.length; i++) if (lines[i].id === id) return lines[i];
  }
  throw new Error('missing ' + id);
}

var today = '2026-10-04';
assert.strictEqual(AQ.addWorkingDays(today, 10), '2026-10-16');
assert.strictEqual(AQ.addWorkingDays('2026-10-09', 1), '2026-10-12');
assert.strictEqual(AQ.addWorkingDays('2026-10-05', 10), '2026-10-19');

var state = AQ.seed();
var groups = AQ.groupPackages(state.packages, today);
assert.deepStrictEqual(groups.rises.map(function (p) { return p.id; }), ['p-riverside']);
assert.deepStrictEqual(groups.later.map(function (p) { return p.id; }), ['p-harbour']);
assert.strictEqual(groups.undated.length, 0);
assert.strictEqual(groups.horizon, '2026-10-16');
assert.strictEqual(AQ.dateTone('2026-10-08', today), 'inside');
assert.strictEqual(AQ.dateTone('2026-11-06', today), 'later');
assert.strictEqual(AQ.dateTone('', today), 'undated');
assert.strictEqual(AQ.dateTone('2026-10-02', today), 'before-today');

var overdue = JSON.parse(JSON.stringify(state.packages));
overdue[0].applicationDue = '2026-10-01';
overdue[1].applicationDue = '2026-10-08';
var og = AQ.groupPackages(overdue, today);
assert.deepStrictEqual(og.rises.map(function (p) { return p.applicationDue; }), ['2026-10-01', '2026-10-08']);

var conduit = lineById(state, 'rs-conduit');
var view = AQ.assess(conduit, state.rates);
assert.strictEqual(view.parked, false);
assert.strictEqual(view.blocks.length, 0);
assert.strictEqual(view.figures.thisClaim.valuePence, 82800);
assert.strictEqual(view.figures.applied.valuePence, 331200);
assert.strictEqual(view.fullyReleased, false);
assert.strictEqual(view.canRelease.thisClaim, true);
assert.strictEqual(view.canRelease.applied, true);
assert.strictEqual(view.canRelease.certified, true);

var board = AQ.assess(lineById(state, 'rs-board'), state.rates);
assert.strictEqual(board.parked, true);
assert.deepStrictEqual(board.missing, ['photo']);
assert.strictEqual(board.figures.thisClaim.exists, false);
assert.strictEqual(board.canRelease.thisClaim, false);

var opening = AQ.assess(lineById(state, 'rs-opening'), state.rates);
assert.strictEqual(opening.rate.status, 'blank');
assert.strictEqual(opening.figures.thisClaim.exists, false);
assert.strictEqual(opening.figures.thisClaim.valuePence, null);
assert.ok(AQ.lineFlags(opening).some(function (f) { return f.key === 'norate'; }));

var daywork = AQ.assess(lineById(state, 'rs-daywork'), state.rates);
assert.strictEqual(daywork.parked, true);
assert.deepStrictEqual(daywork.missing, ['daywork sheet']);

var batten = AQ.assess(lineById(state, 'rs-batten'), state.rates);
assert.strictEqual(batten.short, true);
assert.ok(batten.blocks.indexOf('short-unwritten') !== -1);
assert.strictEqual(batten.canRelease.thisClaim, false);
assert.strictEqual(batten.figures.thisClaim.valuePence, 69200);

var battenLine = lineById(state, 'rs-batten');
battenLine.shortReason = '   ';
assert.ok(AQ.assess(battenLine, state.rates).blocks.indexOf('short-unwritten') !== -1);
battenLine.shortReason = 'Certified 8 short of the earlier application. Illustration note only.';
var battenReady = AQ.assess(battenLine, state.rates);
assert.strictEqual(battenReady.short, true);
assert.ok(battenReady.blocks.indexOf('short-unwritten') === -1);
assert.strictEqual(battenReady.canRelease.thisClaim, true);

var extra = AQ.assess(lineById(state, 'rs-extra'), state.rates);
assert.ok(extra.blocks.indexOf('notice') !== -1);
assert.ok(extra.blocks.indexOf('dispute') !== -1);
assert.strictEqual(extra.canRelease.thisClaim, false);
assert.strictEqual(extra.short, false);

var stair = AQ.assess(lineById(state, 'hb-stair'), state.rates);
assert.strictEqual(stair.short, false);
assert.strictEqual(stair.figures.certified.exists, false);
assert.strictEqual(stair.figures.certified.valuePence, null);
assert.strictEqual(stair.figures.applied.exists, true);
assert.strictEqual(stair.canRelease.certified, false);
assert.strictEqual(stair.canRelease.thisClaim, true);

assert.strictEqual(AQ.parseQty('').state, 'partial');
assert.strictEqual(AQ.parseQty('').milli, null);
assert.strictEqual(AQ.parseQty('0').milli, 0);
assert.strictEqual(AQ.parseQty('12.').state, 'partial');
assert.strictEqual(AQ.parseQty('10m').state, 'invalid');
assert.strictEqual(AQ.parseRate('').usable, false);
assert.strictEqual(AQ.parseRate('').pence, null);
assert.strictEqual(AQ.parseRate('0').pence, 0);
assert.strictEqual(AQ.parseRate('18.405').usable, false);
assert.strictEqual(AQ.parseRate('18.40').pence, 1840);

var pricedZero = AQ.assess({
  rateId: 'rate-opening',
  qtyAppliedBefore: '',
  qtyLastCertified: '',
  qtyThis: '3',
  shortReason: '',
  noticeRisk: false,
  disputeMentioned: false,
  releases: AQ.blankReleases(),
  evidence: AQ.blankEvidence()
}, [{ id: 'rate-opening', code: 'X', description: '', unit: 'nr', amountText: '0' }]);
assert.strictEqual(pricedZero.figures.thisClaim.exists, true);
assert.strictEqual(pricedZero.figures.thisClaim.valuePence, 0);

var rel = AQ.tryRelease(conduit, state.rates, 'thisClaim', { now: '2026-10-04T18:08:00.000Z', by: 'Director' });
assert.strictEqual(rel.ok, true);
assert.strictEqual(AQ.assess(conduit, state.rates).releases.thisClaim.valid, true);
assert.strictEqual(AQ.reconcile(conduit, state.rates), false);
assert.strictEqual(AQ.assess(conduit, state.rates).releases.thisClaim.valid, true);

conduit.qtyThis = '46';
assert.strictEqual(AQ.reconcile(conduit, state.rates), true);
assert.strictEqual(conduit.releases.thisClaim, null);
assert.ok(/Nothing was sent/.test(conduit.systemNote));
conduit.qtyThis = '45';
conduit.systemNote = '';
AQ.tryRelease(conduit, state.rates, 'thisClaim', { now: '2026-10-04T18:09:00.000Z', by: 'Director' });
conduit.noticeRisk = true;
assert.strictEqual(AQ.reconcile(conduit, state.rates), true);
assert.strictEqual(conduit.releases.thisClaim, null);
conduit.noticeRisk = false;

var parkedTry = AQ.tryRelease(lineById(state, 'rs-board'), state.rates, 'thisClaim', { now: '2026-10-04T18:10:00.000Z', by: 'Director' });
assert.strictEqual(parkedTry.ok, false);
assert.strictEqual(lineById(state, 'rs-board').releases.thisClaim, null);

var noFig = AQ.tryRelease(lineById(state, 'rs-opening'), state.rates, 'thisClaim', { now: '2026-10-04T18:10:00.000Z', by: 'Director' });
assert.strictEqual(noFig.ok, false);

assert.strictEqual(AQ.formatGBP(331200), '£3,312.00');
assert.strictEqual(AQ.formatGBP(-2000), '-£20.00');
assert.strictEqual(AQ.formatGBP(0), '£0.00');

assert.strictEqual(AQ.canAddLive(state.packages), true);
assert.strictEqual(AQ.liveCount(state.packages), 2);
var four = state.packages.concat([{ live: true }, { live: true }]);
assert.strictEqual(AQ.canAddLive(four), false);

var harbour = state.packages[1];
assert.strictEqual(AQ.sumThisClaim(harbour.lines, state.rates, false), 86500 + 9200);
assert.strictEqual(AQ.sumThisClaim(harbour.lines, state.rates, true), null);

var neg = AQ.assess({
  rateId: 'rate-conduit',
  qtyAppliedBefore: '',
  qtyLastCertified: '',
  qtyThis: '-2',
  shortReason: '',
  noticeRisk: false,
  disputeMentioned: false,
  releases: AQ.blankReleases(),
  evidence: AQ.blankEvidence()
}, state.rates);
assert.strictEqual(neg.figures.thisClaim.valuePence, -3680);

assert.strictEqual(AQ.sumThisClaim(state.packages[0].lines, state.rates, false) !== null, true);
var drafted = AQ.sumThisClaim(state.packages[0].lines, state.rates, false);
assert.strictEqual(drafted, 82800 + 69200 + 22080);

console.log('logic.test.js ok', drafted);

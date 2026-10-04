/* ApplyQueue rules. No network. No dates invented. No rates guessed. Nothing is sent. */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (typeof root !== 'undefined') root.AQ = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var CAP = 4;
  var EVIDENCE = [
    { key: 'daywork', label: 'Daywork sheet', missing: 'daywork sheet' },
    { key: 'photo', label: 'Photo', missing: 'photo' },
    { key: 'instruction', label: 'Instruction email', missing: 'instruction email' },
    { key: 'delivery', label: 'Delivery ticket', missing: 'delivery ticket' }
  ];
  var FIG_KEYS = ['applied', 'certified', 'thisClaim'];
  var FIG_LABEL = { applied: 'applied', certified: 'last certified', thisClaim: 'this claim' };
  var QTY_FIELD = { applied: 'qtyAppliedBefore', certified: 'qtyLastCertified', thisClaim: 'qtyThis' };

  function pad(n) { return n < 10 ? '0' + n : String(n); }

  function toISO(date) {
    return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate());
  }

  function parseISO(iso) {
    var p = String(iso).split('-');
    return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]), 12, 0, 0, 0);
  }

  function isWeekday(date) {
    var day = date.getDay();
    return day !== 0 && day !== 6;
  }

  function addWorkingDays(iso, n) {
    var date = parseISO(iso);
    var left = n;
    while (left > 0) {
      date.setDate(date.getDate() + 1);
      if (isWeekday(date)) left -= 1;
    }
    return toISO(date);
  }

  function todayISO(now) {
    var date = now || new Date();
    return toISO(date);
  }

  function formatDay(iso) {
    if (!iso) return '';
    var date = parseISO(iso);
    var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return date.getDate() + ' ' + months[date.getMonth()] + ' ' + date.getFullYear();
  }

  function formatGBP(pence) {
    var neg = pence < 0;
    var n = Math.abs(pence);
    var pounds = Math.floor(n / 100);
    var frac = String(n % 100).padStart(2, '0');
    var withCommas = String(pounds).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return (neg ? '-£' : '£') + withCommas + '.' + frac;
  }

  function mulPence(milli, ratePence) {
    var neg = milli < 0;
    var product = Math.abs(milli) * ratePence;
    var pence = Math.floor((product + 500) / 1000);
    return neg ? -pence : pence;
  }

  function parseRate(text) {
    var s = String(text == null ? '' : text).trim();
    if (s === '') return { empty: true, usable: false, pence: null };
    var m = s.match(/^(\d+)(?:\.(\d{1,2}))?$/);
    if (!m) return { empty: false, usable: false, pence: null };
    var pence = Number(m[1]) * 100 + Number((m[2] || '').padEnd(2, '0'));
    return { empty: false, usable: true, pence: pence };
  }

  function parseQty(text) {
    var s = String(text == null ? '' : text).trim();
    if (s === '' || s === '-' || /^-?\d+\.$/.test(s)) return { state: 'partial', milli: null };
    var m = s.match(/^(-?)(\d+)(?:\.(\d{1,3}))?$/);
    if (!m) return { state: 'invalid', milli: null };
    var sign = m[1] === '-' ? -1 : 1;
    var milli = sign * (Number(m[2]) * 1000 + Number((m[3] || '').padEnd(3, '0')));
    return { state: 'ok', milli: milli };
  }

  function blankEvidence() {
    return {
      daywork: { needed: false, present: false, ref: '' },
      photo: { needed: false, present: false, ref: '' },
      instruction: { needed: false, present: false, ref: '' },
      delivery: { needed: false, present: false, ref: '' }
    };
  }

  function blankReleases() {
    return { applied: null, certified: null, thisClaim: null };
  }

  function resolveRate(line, rates) {
    if (!line.rateId) return { status: 'none' };
    var rate = null;
    for (var i = 0; i < rates.length; i++) {
      if (rates[i].id === line.rateId) rate = rates[i];
    }
    if (!rate) return { status: 'none' };
    var parsed = parseRate(rate.amountText);
    var base = {
      id: rate.id,
      code: rate.code || '',
      unit: rate.unit || '',
      description: rate.description || ''
    };
    if (parsed.empty) return Object.assign({ status: 'blank' }, base);
    if (!parsed.usable) return Object.assign({ status: 'unreadable' }, base);
    return Object.assign({ status: 'priced', pence: parsed.pence, amountText: String(rate.amountText).trim() }, base);
  }

  function missingEvidence(line) {
    var missing = [];
    var ev = line.evidence || {};
    for (var i = 0; i < EVIDENCE.length; i++) {
      var spec = EVIDENCE[i];
      var slot = ev[spec.key] || { needed: false, present: false };
      if (slot.needed && !slot.present) missing.push(spec.missing);
    }
    return missing;
  }

  function reasonWritten(line) {
    return String(line.shortReason || '').trim().length > 0;
  }

  function buildFigure(qtyText, rate, parked) {
    var parsed = parseQty(qtyText);
    var base = {
      qtyState: parsed.state,
      qtyMilli: parsed.milli,
      valuePence: null,
      exists: false
    };
    if (parked || !rate || rate.status !== 'priced' || parsed.state !== 'ok') return base;
    base.valuePence = mulPence(parsed.milli, rate.pence);
    base.exists = true;
    return base;
  }

  function assess(line, rates) {
    var missing = missingEvidence(line);
    var parked = missing.length > 0;
    var rate = resolveRate(line, rates);
    var appliedQty = parseQty(line.qtyAppliedBefore);
    var certifiedQty = parseQty(line.qtyLastCertified);
    var short = false;
    if (appliedQty.state === 'ok' && certifiedQty.state === 'ok') {
      short = certifiedQty.milli < appliedQty.milli;
    }
    var written = reasonWritten(line);
    var blocks = [];
    var blockText = [];
    if (parked) {
      blocks.push('parked');
      blockText.push('Parked. Still missing: ' + missing.join(', ') + '.');
    }
    if (short && !written) {
      blocks.push('short-unwritten');
      blockText.push('The certificate is short on the quantities entered, and the reason is not written down.');
    }
    if (line.noticeRisk) {
      blocks.push('notice');
      blockText.push('A notice might give away a right. This figure stays unreleased.');
    }
    if (line.disputeMentioned) {
      blocks.push('dispute');
      blockText.push('Someone has mentioned a dispute. This figure stays unreleased.');
    }
    var figures = {
      applied: buildFigure(line.qtyAppliedBefore, rate, parked),
      certified: buildFigure(line.qtyLastCertified, rate, parked),
      thisClaim: buildFigure(line.qtyThis, rate, parked)
    };
    var releases = blankReleases();
    var stored = line.releases || blankReleases();
    for (var i = 0; i < FIG_KEYS.length; i++) {
      var key = FIG_KEYS[i];
      var rec = stored[key];
      var fig = figures[key];
      var valid = false;
      if (rec && blocks.length === 0 && fig.exists && rec.valuePence === fig.valuePence && rec.qtyMilli === fig.qtyMilli && rate.status === 'priced' && rec.rateId === rate.id && rec.ratePence === rate.pence) {
        valid = true;
      }
      releases[key] = { valid: valid, record: valid ? rec : null };
    }
    var existing = FIG_KEYS.filter(function (key) { return figures[key].exists; });
    var fullyReleased = existing.length > 0 && existing.every(function (key) { return releases[key].valid; });
    var canRelease = {};
    for (var j = 0; j < FIG_KEYS.length; j++) {
      var k = FIG_KEYS[j];
      canRelease[k] = blocks.length === 0 && figures[k].exists && !releases[k].valid;
    }
    return {
      missing: missing,
      parked: parked,
      rate: rate,
      short: short,
      reasonWritten: written,
      blocks: blocks,
      blockText: blockText,
      figures: figures,
      releases: releases,
      fullyReleased: fullyReleased,
      anyFigure: existing.length > 0,
      canRelease: canRelease
    };
  }

  function reconcile(line, rates) {
    if (!line.releases) line.releases = blankReleases();
    var view = assess(line, rates);
    var cleared = [];
    for (var i = 0; i < FIG_KEYS.length; i++) {
      var key = FIG_KEYS[i];
      if (!line.releases[key]) continue;
      if (!view.releases[key].valid) {
        line.releases[key] = null;
        cleared.push(FIG_LABEL[key]);
      }
    }
    if (!cleared.length) return false;
    var why = view.blocks.length
      ? 'the line is parked or on hold'
      : 'a figure changed';
    line.systemNote = 'Release withdrawn (' + cleared.join(', ') + ') because ' + why + '. Nothing was sent.';
    return true;
  }

  function tryRelease(line, rates, which, meta) {
    reconcile(line, rates);
    var view = assess(line, rates);
    if (!view.canRelease[which]) {
      return { ok: false, reason: view.blockText.join(' ') || 'There is no figure to release.' };
    }
    var fig = view.figures[which];
    line.releases[which] = {
      at: meta.now,
      by: meta.by || 'Director',
      qtyMilli: fig.qtyMilli,
      valuePence: fig.valuePence,
      rateId: view.rate.id,
      ratePence: view.rate.pence
    };
    line.systemNote = '';
    return { ok: true };
  }

  function withdrawRelease(line, which) {
    if (!line.releases || !line.releases[which]) return false;
    line.releases[which] = null;
    line.systemNote = 'Release withdrawn by the director. Nothing was sent.';
    return true;
  }

  function groupPackages(packages, today) {
    var horizon = addWorkingDays(today, 10);
    var rises = [];
    var later = [];
    var undated = [];
    var closed = [];
    for (var i = 0; i < packages.length; i++) {
      var pkg = packages[i];
      if (!pkg.live) {
        closed.push(pkg);
        continue;
      }
      if (!pkg.applicationDue) undated.push(pkg);
      else if (pkg.applicationDue <= horizon) rises.push(pkg);
      else later.push(pkg);
    }
    function byDate(a, b) {
      if (a.applicationDue < b.applicationDue) return -1;
      if (a.applicationDue > b.applicationDue) return 1;
      return String(a.name).localeCompare(String(b.name));
    }
    rises.sort(byDate);
    later.sort(byDate);
    return { horizon: horizon, rises: rises, later: later, undated: undated, closed: closed };
  }

  function dateTone(due, today) {
    if (!due) return 'undated';
    var horizon = addWorkingDays(today, 10);
    if (due < today) return 'before-today';
    if (due <= horizon) return 'inside';
    return 'later';
  }

  function liveCount(packages) {
    var n = 0;
    for (var i = 0; i < packages.length; i++) if (packages[i].live) n += 1;
    return n;
  }

  function canAddLive(packages) {
    return liveCount(packages) < CAP;
  }

  function sumThisClaim(lines, rates, onlyReleased) {
    var any = false;
    var pence = 0;
    for (var i = 0; i < lines.length; i++) {
      var view = assess(lines[i], rates);
      var fig = view.figures.thisClaim;
      if (!fig.exists) continue;
      if (onlyReleased && !view.releases.thisClaim.valid) continue;
      any = true;
      pence += fig.valuePence;
    }
    return any ? pence : null;
  }

  function lineFlags(view) {
    var flags = [];
    if (view.parked) flags.push({ key: 'parked', label: 'Parked' });
    if (view.rate.status === 'none' || view.rate.status === 'blank' || view.rate.status === 'unreadable') {
      flags.push({ key: 'norate', label: 'No rate' });
    }
    if (view.blocks.indexOf('short-unwritten') !== -1 || view.blocks.indexOf('notice') !== -1 || view.blocks.indexOf('dispute') !== -1) {
      flags.push({ key: 'held', label: 'Held' });
    }
    if (view.fullyReleased) flags.push({ key: 'released', label: 'Released · not sent' });
    else if (!view.parked && view.blocks.length === 0 && view.anyFigure) flags.push({ key: 'ready', label: 'Ready for the director' });
    return flags;
  }

  function evSlot(needed, present, ref) {
    return { needed: !!needed, present: !!present, ref: ref || '' };
  }

  function seed() {
    return {
      schema: 1,
      firmName: 'Example Electrical',
      directorName: '',
      ratesIllustration: true,
      selectedId: 'p-riverside',
      view: 'queue',
      flash: '',
      rates: [
        { id: 'rate-conduit', code: 'SW-CON-50', description: 'Steel conduit 20mm, fixed', unit: 'm', amountText: '18.40' },
        { id: 'rate-board', code: 'SW-DB-01', description: 'Distribution board, 12-way', unit: 'nr', amountText: '640.00' },
        { id: 'rate-batten', code: 'LT-FIT-01', description: 'LED batten 1500mm', unit: 'nr', amountText: '86.50' },
        { id: 'rate-daywork', code: 'DW-ATT', description: 'Daywork electrician attendance', unit: 'hr', amountText: '62.00' },
        { id: 'rate-opening', code: 'BW-OPEN', description: "Builder's work opening in blockwork", unit: 'nr', amountText: '' }
      ],
      packages: [
        {
          id: 'p-riverside',
          illustration: true,
          live: true,
          name: 'Riverside switchroom',
          reference: 'ILL-01',
          mainContractor: 'Example Build Ltd',
          site: '1 Example Wharf, Sampletown',
          applicationDue: '2026-10-08',
          certificateExpected: '2026-10-23',
          certifier: 'A. Example, commercial manager',
          evidenceLives: 'Site cabin, drawer ILL-01',
          note: '',
          lines: [
            {
              id: 'rs-conduit',
              illustration: true,
              description: 'Steel conduit 20mm, fixed to steel',
              rateId: 'rate-conduit',
              qtyAppliedBefore: '180',
              qtyLastCertified: '180',
              qtyThis: '45',
              shortReason: '',
              noticeRisk: false,
              disputeMentioned: false,
              systemNote: '',
              releases: blankReleases(),
              evidence: {
                daywork: evSlot(false, false, ''),
                photo: evSlot(true, true, 'IMG-19, illustration'),
                instruction: evSlot(false, false, ''),
                delivery: evSlot(true, true, 'DT-441, illustration')
              }
            },
            {
              id: 'rs-board',
              illustration: true,
              description: 'Distribution board, 12-way',
              rateId: 'rate-board',
              qtyAppliedBefore: '2',
              qtyLastCertified: '2',
              qtyThis: '1',
              shortReason: '',
              noticeRisk: false,
              disputeMentioned: false,
              systemNote: '',
              releases: blankReleases(),
              evidence: {
                daywork: evSlot(false, false, ''),
                photo: evSlot(true, false, ''),
                instruction: evSlot(false, false, ''),
                delivery: evSlot(true, true, 'DT-442, illustration')
              }
            },
            {
              id: 'rs-opening',
              illustration: true,
              description: "Builder's work opening in blockwork",
              rateId: 'rate-opening',
              qtyAppliedBefore: '',
              qtyLastCertified: '',
              qtyThis: '4',
              shortReason: '',
              noticeRisk: false,
              disputeMentioned: false,
              systemNote: '',
              releases: blankReleases(),
              evidence: {
                daywork: evSlot(false, false, ''),
                photo: evSlot(true, true, 'IMG-20, illustration'),
                instruction: evSlot(false, false, ''),
                delivery: evSlot(false, false, '')
              }
            },
            {
              id: 'rs-daywork',
              illustration: true,
              description: 'Electrician attendance on a site instruction',
              rateId: 'rate-daywork',
              qtyAppliedBefore: '',
              qtyLastCertified: '',
              qtyThis: '6',
              shortReason: '',
              noticeRisk: false,
              disputeMentioned: false,
              systemNote: '',
              releases: blankReleases(),
              evidence: {
                daywork: evSlot(true, false, ''),
                photo: evSlot(false, false, ''),
                instruction: evSlot(true, true, 'Email from Example site manager, illustration'),
                delivery: evSlot(false, false, '')
              }
            },
            {
              id: 'rs-batten',
              illustration: true,
              description: 'LED batten 1500mm',
              rateId: 'rate-batten',
              qtyAppliedBefore: '20',
              qtyLastCertified: '12',
              qtyThis: '8',
              shortReason: '',
              noticeRisk: false,
              disputeMentioned: false,
              systemNote: '',
              releases: blankReleases(),
              evidence: {
                daywork: evSlot(false, false, ''),
                photo: evSlot(false, false, ''),
                instruction: evSlot(false, false, ''),
                delivery: evSlot(true, true, 'DT-443, illustration')
              }
            },
            {
              id: 'rs-extra',
              illustration: true,
              description: 'Extra conduit asked for on site',
              rateId: 'rate-conduit',
              qtyAppliedBefore: '',
              qtyLastCertified: '',
              qtyThis: '12',
              shortReason: '',
              noticeRisk: true,
              disputeMentioned: true,
              systemNote: '',
              releases: blankReleases(),
              evidence: {
                daywork: evSlot(false, false, ''),
                photo: evSlot(false, false, ''),
                instruction: evSlot(true, true, 'Instruction email, illustration'),
                delivery: evSlot(false, false, '')
              }
            }
          ]
        },
        {
          id: 'p-harbour',
          illustration: true,
          live: true,
          name: 'Harbour lighting',
          reference: 'ILL-02',
          mainContractor: 'Example Build Ltd',
          site: 'Harbour Road, Sampletown',
          applicationDue: '2026-11-06',
          certificateExpected: '',
          certifier: 'C. Example, commercial manager',
          evidenceLives: '',
          note: '',
          lines: [
            {
              id: 'hb-batten',
              illustration: true,
              description: 'LED batten 1500mm to the stair core',
              rateId: 'rate-batten',
              qtyAppliedBefore: '40',
              qtyLastCertified: '40',
              qtyThis: '10',
              shortReason: '',
              noticeRisk: false,
              disputeMentioned: false,
              systemNote: '',
              releases: blankReleases(),
              evidence: {
                daywork: evSlot(false, false, ''),
                photo: evSlot(true, true, 'IMG-30, illustration'),
                instruction: evSlot(false, false, ''),
                delivery: evSlot(true, true, 'DT-510, illustration')
              }
            },
            {
              id: 'hb-stair',
              illustration: true,
              description: 'Steel conduit 20mm to the stair core',
              rateId: 'rate-conduit',
              qtyAppliedBefore: '15',
              qtyLastCertified: '',
              qtyThis: '5',
              shortReason: '',
              noticeRisk: false,
              disputeMentioned: false,
              systemNote: '',
              releases: blankReleases(),
              evidence: {
                daywork: evSlot(false, false, ''),
                photo: evSlot(true, true, 'IMG-31, illustration'),
                instruction: evSlot(false, false, ''),
                delivery: evSlot(true, true, 'DT-511, illustration')
              }
            }
          ]
        }
      ]
    };
  }

  return {
    CAP: CAP,
    EVIDENCE: EVIDENCE,
    FIG_KEYS: FIG_KEYS,
    FIG_LABEL: FIG_LABEL,
    QTY_FIELD: QTY_FIELD,
    addWorkingDays: addWorkingDays,
    todayISO: todayISO,
    formatDay: formatDay,
    formatGBP: formatGBP,
    parseRate: parseRate,
    parseQty: parseQty,
    blankEvidence: blankEvidence,
    blankReleases: blankReleases,
    resolveRate: resolveRate,
    assess: assess,
    reconcile: reconcile,
    tryRelease: tryRelease,
    withdrawRelease: withdrawRelease,
    groupPackages: groupPackages,
    dateTone: dateTone,
    liveCount: liveCount,
    canAddLive: canAddLive,
    sumThisClaim: sumThisClaim,
    lineFlags: lineFlags,
    seed: seed
  };
});

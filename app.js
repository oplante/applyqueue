/* ApplyQueue screen. Talks only to this browser. */
(function () {
  'use strict';
  if (typeof document === 'undefined') return;
  var AQ = window.AQ;
  var KEY = 'applyqueue.v1';
  var root = document.getElementById('app');
  var state = null;
  var preserveScroll = true;

  function e(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function uid(prefix) {
    return prefix + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7);
  }

  function selected() {
    for (var i = 0; i < state.packages.length; i++) {
      if (state.packages[i].id === state.selectedId) return state.packages[i];
    }
    return null;
  }

  function findLine(id) {
    for (var p = 0; p < state.packages.length; p++) {
      var lines = state.packages[p].lines;
      for (var i = 0; i < lines.length; i++) {
        if (lines[i].id === id) return lines[i];
      }
    }
    return null;
  }

  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (err) { /* private mode */ }
  }

  function blankLine() {
    return {
      id: uid('line'),
      illustration: false,
      description: '',
      rateId: '',
      qtyAppliedBefore: '',
      qtyLastCertified: '',
      qtyThis: '',
      shortReason: '',
      noticeRisk: false,
      disputeMentioned: false,
      systemNote: '',
      releases: AQ.blankReleases(),
      evidence: AQ.blankEvidence()
    };
  }

  function repairEvidence(raw) {
    var base = AQ.blankEvidence();
    var src = raw || {};
    AQ.EVIDENCE.forEach(function (spec) {
      var slot = src[spec.key] || {};
      base[spec.key] = {
        needed: !!slot.needed,
        present: !!slot.present,
        ref: typeof slot.ref === 'string' ? slot.ref : ''
      };
    });
    return base;
  }

  function repair(data) {
    if (!data || data.schema !== 1 || !Array.isArray(data.packages) || !Array.isArray(data.rates)) return null;
    data.firmName = typeof data.firmName === 'string' ? data.firmName : '';
    data.directorName = typeof data.directorName === 'string' ? data.directorName : '';
    data.ratesIllustration = !!data.ratesIllustration;
    data.view = data.view === 'rates' ? 'rates' : 'queue';
    data.flash = '';
    data.rates.forEach(function (rate) {
      rate.code = typeof rate.code === 'string' ? rate.code : '';
      rate.description = typeof rate.description === 'string' ? rate.description : '';
      rate.unit = typeof rate.unit === 'string' ? rate.unit : '';
      rate.amountText = rate.amountText == null ? '' : String(rate.amountText);
    });
    data.packages.forEach(function (pkg) {
      pkg.live = pkg.live !== false;
      pkg.illustration = !!pkg.illustration;
      ['name', 'reference', 'mainContractor', 'site', 'applicationDue', 'certificateExpected', 'certifier', 'evidenceLives', 'note'].forEach(function (key) {
        if (typeof pkg[key] !== 'string') pkg[key] = '';
      });
      if (!Array.isArray(pkg.lines)) pkg.lines = [];
      pkg.lines.forEach(function (line) {
        line.illustration = !!line.illustration;
        line.description = typeof line.description === 'string' ? line.description : '';
        line.rateId = typeof line.rateId === 'string' ? line.rateId : '';
        ['qtyAppliedBefore', 'qtyLastCertified', 'qtyThis', 'shortReason', 'systemNote'].forEach(function (key) {
          if (typeof line[key] !== 'string') line[key] = '';
        });
        line.noticeRisk = !!line.noticeRisk;
        line.disputeMentioned = !!line.disputeMentioned;
        line.evidence = repairEvidence(line.evidence);
        var releases = AQ.blankReleases();
        var stored = line.releases || {};
        AQ.FIG_KEYS.forEach(function (key) {
          releases[key] = stored[key] && typeof stored[key] === 'object' ? stored[key] : null;
        });
        line.releases = releases;
      });
    });
    if (!data.packages.some(function (pkg) { return pkg.id === data.selectedId; })) {
      data.selectedId = data.packages.length ? data.packages[0].id : '';
    }
    return data;
  }

  function load() {
    try {
      var raw = localStorage.getItem(KEY);
      if (!raw) return AQ.seed();
      var repaired = repair(JSON.parse(raw));
      return repaired || AQ.seed();
    } catch (err) {
      return AQ.seed();
    }
  }

  function reconcileAll() {
    var changed = false;
    state.packages.forEach(function (pkg) {
      pkg.lines.forEach(function (line) {
        if (AQ.reconcile(line, state.rates)) changed = true;
      });
    });
    return changed;
  }

  function formatLong(iso) {
    if (!iso) return '';
    var parts = iso.split('-');
    var date = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    return date.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' });
  }

  function formatStamp(iso) {
    var date = new Date(iso);
    if (isNaN(date.getTime())) return '';
    return date.toLocaleString('en-GB', {
      timeZone: 'Europe/London',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23'
    }) + ' UK';
  }

  function focusKey(bind) {
    return String(bind).replace(/[^a-zA-Z0-9_-]/g, '_');
  }

  function bindAttr(bind) {
    return ' data-bind="' + e(bind) + '" data-focuskey="' + focusKey(bind) + '" autocomplete="off"';
  }

  function illustrationOn() {
    if (state.ratesIllustration) return true;
    return state.packages.some(function (pkg) { return pkg.illustration; });
  }

  function tally(pkg) {
    var counts = { parked: 0, held: 0, norate: 0, ready: 0, released: 0 };
    pkg.lines.forEach(function (line) {
      AQ.lineFlags(AQ.assess(line, state.rates)).forEach(function (flag) {
        counts[flag.key] += 1;
      });
    });
    return counts;
  }

  function tallyText(counts) {
    var bits = [];
    if (counts.parked) bits.push(counts.parked + ' parked');
    if (counts.norate) bits.push(counts.norate + ' no rate');
    if (counts.held) bits.push(counts.held + ' held');
    if (counts.ready) bits.push(counts.ready + ' ready');
    if (counts.released) bits.push(counts.released + ' released');
    if (!bits.length) return 'No lines yet';
    return bits.join(' · ');
  }

  function toneText(due, today) {
    var tone = AQ.dateTone(due, today);
    if (tone === 'before-today') return 'The date on the card is before today';
    if (tone === 'inside') return 'Inside the next 10 working days';
    if (tone === 'later') return 'After the next 10 working days';
    return '';
  }

  function queueButton(pkg, today) {
    var counts = tally(pkg);
    var name = pkg.name.trim() ? pkg.name.trim() : 'No name on the card';
    var date = pkg.applicationDue ? AQ.formatDay(pkg.applicationDue) : 'No application date';
    var current = pkg.id === state.selectedId ? ' aria-current="true"' : '';
    var cert = pkg.certificateExpected ? '<span class="minor">Certificate expected ' + e(AQ.formatDay(pkg.certificateExpected)) + '</span>' : '';
    var illus = pkg.illustration ? '<span class="chip illus">Illustration</span>' : '';
    var closed = pkg.live ? '' : '<span class="chip closed">Closed</span>';
    return '<button type="button" class="q-item' + (pkg.id === state.selectedId ? ' on' : '') + '" data-action="select-package" data-id="' + e(pkg.id) + '"' + current + '>'
      + '<span class="q-name">' + e(name) + '</span>'
      + illus + closed
      + '<span class="q-date">' + e(date) + '</span>'
      + '<span class="q-tone">' + e(toneText(pkg.applicationDue, today)) + '</span>'
      + cert
      + '<span class="q-counts">' + e(tallyText(counts)) + '</span>'
      + '</button>';
  }

  function queueGroup(title, note, list, today, kind) {
    if (!list.length) return '';
    var items = list.map(function (pkg) { return queueButton(pkg, today); }).join('');
    return '<section class="q-group ' + e(kind || '') + '"><h2>' + e(title) + '</h2><p class="quiet">' + e(note) + '</p>' + items + '</section>';
  }

  function renderQueue(today) {
    var groups = AQ.groupPackages(state.packages, today);
    var html = '<aside class="queue">'
      + '<p class="today">Today is ' + e(formatLong(today)) + '. Working days are Monday to Friday. Bank holidays are not taken off.</p>'
      + '<p class="horizon">A package rises when its application date is on or before ' + e(AQ.formatDay(groups.horizon)) + '. That is 10 working days on from today. No date is added if the card is blank.</p>'
      + queueGroup('Rises', 'Due in the next 10 working days, or the date on the card is already past.', groups.rises, today, 'rises')
      + queueGroup('Later', 'Application date is after that window.', groups.later, today, 'later')
      + queueGroup('No application date', 'The date is empty, so it stays empty.', groups.undated, today, 'undated')
      + queueGroup('Closed', 'Not a live package. It does not take one of the 4 slots.', groups.closed, today, 'closed');
    if (!state.packages.length) html += '<p class="quiet">No packages in this browser.</p>';
    var live = AQ.liveCount(state.packages);
    html += '<button type="button" class="add" data-action="add-package"' + (AQ.canAddLive(state.packages) ? '' : ' disabled') + '>Add a live package</button>';
    html += '<p class="cap">' + live + ' of ' + AQ.CAP + ' live packages.</p>';
    if (!AQ.canAddLive(state.packages)) html += '<p class="quiet">Close one before adding another.</p>';
    html += '</aside>';
    return html;
  }

  function inputText(label, bind, value, hint) {
    return '<label class="field"><span>' + e(label) + '</span>'
      + '<input type="text"' + bindAttr(bind) + ' value="' + e(value) + '">'
      + (hint ? '<span class="hint">' + e(hint) + '</span>' : '')
      + '</label>';
  }

  function inputDate(label, bind, value, hint) {
    return '<label class="field"><span>' + e(label) + '</span>'
      + '<input type="date"' + bindAttr(bind) + ' value="' + e(value || '') + '">'
      + (hint ? '<span class="hint">' + e(hint) + '</span>' : '')
      + '</label>';
  }

  function rateOptions(selectedId) {
    var html = '<option value="">No rate code</option>';
    state.rates.forEach(function (rate) {
      var parsed = AQ.parseRate(rate.amountText);
      var price = parsed.empty ? 'no price' : (parsed.usable ? AQ.formatGBP(parsed.pence) : 'not read');
      var name = (rate.code || 'No code') + ' — ' + price;
      html += '<option value="' + e(rate.id) + '"' + (rate.id === selectedId ? ' selected' : '') + '>' + e(name) + '</option>';
    });
    return html;
  }

  function figCell(line, view, which, label) {
    var fig = view.figures[which];
    var qtyText = line[AQ.QTY_FIELD[which]];
    var unit = view.rate && view.rate.unit ? view.rate.unit : '';
    var shownQty = String(qtyText || '').trim();
    var qtyLine = shownQty ? e(shownQty) + (unit ? ' ' + e(unit) : '') : '';
    var money = fig.exists ? e(AQ.formatGBP(fig.valuePence)) : '';
    var extra = '';
    if (view.parked && shownQty) extra = '<p class="quiet">Not on the draft while evidence is missing.</p>';
    else if (!view.parked && (view.rate.status === 'none' || view.rate.status === 'blank' || view.rate.status === 'unreadable') && shownQty) {
      extra = '<p class="quiet">No price. Nothing has been guessed.</p>';
    } else if (!view.parked && fig.qtyState === 'invalid') {
      extra = '<p class="quiet">Not a plain number, so no figure is filled in.</p>';
    } else if (!view.parked && which === 'certified' && !shownQty && String(line.qtyAppliedBefore || '').trim()) {
      extra = '<p class="quiet">Left empty. Not taken as zero, and not treated as short.</p>';
    }
    var action = '';
    if (fig.exists && view.releases[which].valid) {
      var rec = view.releases[which].record;
      action = '<p class="released-note">Released by ' + e(rec.by || 'Director') + '. Not sent.<br>' + e(formatStamp(rec.at)) + '</p>'
        + '<button type="button" class="texty" data-action="withdraw" data-line="' + e(line.id) + '" data-which="' + e(which) + '">Withdraw release</button>';
    } else if (fig.exists) {
      action = '<button type="button" class="release" data-action="release" data-line="' + e(line.id) + '" data-which="' + e(which) + '"'
        + (view.canRelease[which] ? '' : ' disabled') + '>Release this figure</button>';
    }
    return '<div class="fig"><h4>' + e(label) + '</h4><p class="qty">' + qtyLine + '</p><p class="money">' + money + '</p>' + extra + action + '</div>';
  }

  function renderLine(line) {
    var view = AQ.assess(line, state.rates);
    var flags = AQ.lineFlags(view).map(function (flag) {
      return '<li class="chip ' + e(flag.key) + '">' + e(flag.label) + '</li>';
    }).join('');
    var title = line.description.trim() ? line.description.trim() : 'No description on the line';
    var rateNote = '';
    if (view.parked && view.rate.status === 'priced') {
      rateNote = 'A rate is on the card. The price stays off the draft until the missing evidence is marked present.';
    } else if (view.rate.status === 'priced') {
      rateNote = 'Rate ' + (view.rate.code || '') + ' · ' + AQ.formatGBP(view.rate.pence) + (view.rate.unit ? ' per ' + view.rate.unit : '') + '. From the rate card.';
    } else if (view.rate.status === 'blank') {
      rateNote = 'Rate code ' + (view.rate.code || 'on the card') + ' has no price. Nothing is guessed.';
    } else if (view.rate.status === 'unreadable') {
      rateNote = 'The rate on the card is not a plain amount. Nothing is guessed.';
    } else {
      rateNote = 'No rate code on this line. Nothing is guessed.';
    }
    var evidence = AQ.EVIDENCE.map(function (spec) {
      var slot = line.evidence[spec.key];
      var prefix = 'line:' + line.id + ':ev:' + spec.key;
      return '<div class="ev">'
        + '<span class="ev-name">' + e(spec.label) + '</span>'
        + '<label><input type="checkbox"' + bindAttr(prefix + ':needed') + (slot.needed ? ' checked' : '') + '> Needed</label>'
        + '<label><input type="checkbox"' + bindAttr(prefix + ':present') + (slot.present ? ' checked' : '') + '> Present</label>'
        + '<input type="text" class="ref" placeholder="Reference, if you have one"' + bindAttr(prefix + ':ref') + ' value="' + e(slot.ref) + '">'
        + '</div>';
    }).join('');
    var blocks = view.blockText.length
      ? '<ul class="blocks">' + view.blockText.map(function (text) { return '<li>' + e(text) + '</li>'; }).join('') + '</ul>'
      : '<p class="quiet">No hold on this line. Each figure that is filled in still needs the director’s release. Nothing is sent.</p>';
    var reason = '';
    if (view.short) {
      reason = '<label class="field"><span>Written reason</span>'
        + '<textarea rows="3"' + bindAttr('line:' + line.id + ':shortReason') + '>' + e(line.shortReason) + '</textarea>'
        + '<span class="hint">' + (view.reasonWritten
          ? 'A reason is on the line. ApplyQueue has not checked it, and it does not say what a contract requires.'
          : 'The certificate is short on the quantities entered. Write the reason before a figure can be released. ApplyQueue does not judge the reason.')
        + '</span></label>';
    }
    var note = line.systemNote ? '<p class="system">' + e(line.systemNote) + '</p>' : '';
    var illus = line.illustration ? '<p class="illus-line">Illustration line. Not a real claim.</p>' : '';
    return '<article class="line ' + e(view.parked ? 'parked' : (view.blocks.length ? 'held' : (view.fullyReleased ? 'released' : (view.rate.status === 'priced' ? 'ready' : 'norate')))) + '">'
      + '<header class="line-h"><h3>' + e(title) + '</h3><ul class="chips">' + flags + '</ul></header>'
      + illus
      + '<label class="field"><span>Description</span><input type="text"' + bindAttr('line:' + line.id + ':description') + ' value="' + e(line.description) + '"></label>'
      + '<section class="role"><h4>Evidence</h4><p class="role-note">Tick what this line needs. If it is needed and not present, the line is parked. No message is sent.</p>'
      + evidence + '</section>'
      + '<section class="role"><h4>Draft</h4><p class="role-note">' + e(rateNote) + '</p>'
      + '<label class="field"><span>Rate code</span><select' + bindAttr('line:' + line.id + ':rateId') + '>' + rateOptions(line.rateId) + '</select></label>'
      + '<div class="qty-edit">'
      + '<label>Applied before this claim<input type="text" inputmode="decimal"' + bindAttr('line:' + line.id + ':qtyAppliedBefore') + ' value="' + e(line.qtyAppliedBefore) + '"></label>'
      + '<label>Last certified<input type="text" inputmode="decimal"' + bindAttr('line:' + line.id + ':qtyLastCertified') + ' value="' + e(line.qtyLastCertified) + '"></label>'
      + '<label>This claim<input type="text" inputmode="decimal"' + bindAttr('line:' + line.id + ':qtyThis') + ' value="' + e(line.qtyThis) + '"></label>'
      + '</div>'
      + '<div class="figs">'
      + figCell(line, view, 'applied', 'Applied')
      + figCell(line, view, 'certified', 'Last certified')
      + figCell(line, view, 'thisClaim', 'This claim')
      + '</div></section>'
      + '<section class="role"><h4>Hold</h4>'
      + blocks
      + reason
      + '<label class="checkline"><input type="checkbox"' + bindAttr('line:' + line.id + ':noticeRisk') + (line.noticeRisk ? ' checked' : '') + '> A notice might give away a right</label>'
      + '<p class="hint">While this is ticked, nothing on the line can be released. Untick it only if you have dealt with it outside this queue. ApplyQueue does not say whether a right is kept or lost.</p>'
      + '<label class="checkline"><input type="checkbox"' + bindAttr('line:' + line.id + ':disputeMentioned') + (line.disputeMentioned ? ' checked' : '') + '> Someone has mentioned a dispute</label>'
      + '<p class="hint">While this is ticked, nothing on the line can be released. This is not a dispute process.</p>'
      + note
      + '</section>'
      + '<button type="button" class="texty danger" data-action="remove-line" data-line="' + e(line.id) + '">Remove this line</button>'
      + '</article>';
  }

  function moneyOrBlank(pence, empty) {
    if (pence == null) return '<p class="money blank">' + e(empty) + '</p>';
    return '<p class="money">' + e(AQ.formatGBP(pence)) + '</p>';
  }

  function renderPackage(pkg, today) {
    var tone = toneText(pkg.applicationDue, today);
    var drafted = AQ.sumThisClaim(pkg.lines, state.rates, false);
    var released = AQ.sumThisClaim(pkg.lines, state.rates, true);
    var illus = pkg.illustration
      ? '<p class="banner tight">Illustration package. Not a real job. Example Electrical is not a real firm.</p>'
      : '';
    var html = '<div class="detail" id="detail">'
      + illus
      + '<header class="pkg-h"><p class="kicker">Live job card</p><h2>' + e(pkg.name.trim() || 'No name on the card') + '</h2>'
      + (tone ? '<p class="tone">' + e(tone) + '</p>' : '')
      + '</header>'
      + '<section class="role dates"><h3>Dates</h3>'
      + '<p class="role-note">Only dates written here are used. ApplyQueue does not invent a contractual deadline. Certificate expected is shown, and it does not move the package up the queue.</p>'
      + '<div class="grid">'
      + inputText('Package name', 'pkg:name', pkg.name, '')
      + inputText('Reference', 'pkg:reference', pkg.reference, '')
      + inputText('Main contractor', 'pkg:mainContractor', pkg.mainContractor, '')
      + inputText('Site', 'pkg:site', pkg.site, '')
      + inputDate('Application due', 'pkg:applicationDue', pkg.applicationDue, 'Only the date already on the card.')
      + inputDate('Certificate expected', 'pkg:certificateExpected', pkg.certificateExpected, 'Leave blank if it is not already written down.')
      + inputText('Who certifies', 'pkg:certifier', pkg.certifier, '')
      + inputText('Where evidence lives', 'pkg:evidenceLives', pkg.evidenceLives, 'A place you already use. Empty stays empty.')
      + '</div>'
      + '<label class="field"><span>Card note</span><textarea rows="2"' + bindAttr('pkg:note') + ' placeholder="Only what you have already written down.">' + e(pkg.note) + '</textarea>'
      + '<span class="hint">A note is not a deadline.</span></label>'
      + '</section>'
      + '<section class="totals"><h3>This claim</h3>'
      + '<div class="total-pair"><div><p class="quiet">On the draft, where a rate and a quantity are present and the line is not parked. Not a certificate.</p>' + moneyOrBlank(drafted, 'No this-claim figure on the draft.') + '</div>'
      + '<div><p class="quiet">Released by the director. Not sent.</p>' + moneyOrBlank(released, 'No this-claim figure released.') + '</div></div></section>'
      + pkg.lines.map(renderLine).join('')
      + (pkg.lines.length ? '' : '<p class="quiet">No claim lines yet. Empty fields stay empty.</p>')
      + '<div class="pkg-actions">'
      + '<button type="button" data-action="add-line">Add a claim line</button>'
      + (pkg.live
        ? '<button type="button" class="texty" data-action="close-package">Close this package</button>'
        : '<button type="button" data-action="reopen-package">Reopen as a live package</button>')
      + '<button type="button" class="texty danger" data-action="remove-package">Remove from this browser</button>'
      + (pkg.illustration ? '<button type="button" class="texty" data-action="mark-package-real">Mark this package as not an illustration</button>' : '')
      + '</div></div>';
    return html;
  }

  function renderRates() {
    var banner = state.ratesIllustration
      ? '<p class="banner tight">Illustration rate card. Not a real firm’s prices. A blank price stays blank.</p>'
      : '<p class="quiet">Blank prices stay blank. ApplyQueue will not fill one in.</p>';
    var rows = state.rates.map(function (rate) {
      return '<div class="rate">'
        + '<label>Code<input type="text"' + bindAttr('rate:' + rate.id + ':code') + ' value="' + e(rate.code) + '"></label>'
        + '<label>Description<input type="text"' + bindAttr('rate:' + rate.id + ':description') + ' value="' + e(rate.description) + '"></label>'
        + '<label>Unit<input type="text"' + bindAttr('rate:' + rate.id + ':unit') + ' value="' + e(rate.unit) + '"></label>'
        + '<label>Rate (£)<input type="text" inputmode="decimal"' + bindAttr('rate:' + rate.id + ':amountText') + ' value="' + e(rate.amountText) + '"></label>'
        + '<button type="button" class="texty danger" data-action="remove-rate" data-rate="' + e(rate.id) + '">Remove</button>'
        + '</div>';
    }).join('');
    return '<div class="detail" id="detail"><section class="role"><h2>Rate card</h2>'
      + '<p class="role-note">Claim lines pick a code. They do not have their own price. If this card has no usable rate, the line is flagged and no amount is guessed.</p>'
      + banner + rows
      + '<div class="pkg-actions"><button type="button" data-action="add-rate">Add a rate</button>'
      + (state.ratesIllustration ? '<button type="button" class="texty" data-action="mark-rates-real">Mark this card as the firm’s own</button>' : '')
      + '</div></section></div>';
  }

  function render() {
    if (reconcileAll()) save();
    var today = AQ.todayISO();
    var y = preserveScroll ? window.scrollY : 0;
    var active = document.activeElement;
    var key = active && active.getAttribute ? active.getAttribute('data-focuskey') : '';
    var selStart = active && typeof active.selectionStart === 'number' ? active.selectionStart : null;
    var selEnd = active && typeof active.selectionEnd === 'number' ? active.selectionEnd : null;
    var pkg = selected();
    var detail = state.view === 'rates' ? renderRates() : (pkg ? renderPackage(pkg, today) : '<div class="detail" id="detail"><p>No package selected.</p></div>');
    var banner = illustrationOn()
      ? '<p class="banner">Illustration data is on this page so the queue is visible. Example Electrical is not a real firm. These are not real jobs, rates, or people.</p>'
      : '';
    root.innerHTML = '<header class="top">'
      + '<div class="brand"><p class="word">ApplyQueue</p><p class="sub">Weekday commercial queue for a specialist subcontractor.</p></div>'
      + '<div class="firm"><label>Firm<input type="text"' + bindAttr('firmName') + ' value="' + e(state.firmName) + '"></label>'
      + '<label>Name on releases<input type="text"' + bindAttr('directorName') + ' value="' + e(state.directorName) + '" placeholder="Optional. Blank releases as Director."></label></div>'
      + '<div class="price"><p class="price-n">£829<span> a month</span></p><p>Up to 4 live packages. Month to month.</p>'
      + '<button type="button" class="checkout" data-action="checkout" disabled>Checkout is not open</button>'
      + '<p class="price-note">No payment is taken on this page.</p></div>'
      + '</header>'
      + banner
      + '<p class="not">Not invoice chasing. Not a reading of a contract. Not a PDF pack. Not a registration form. Not legal advice. Does not certify a payment. Does not interpret a contract. Nothing on this page is sent.</p>'
      + '<ol class="roles"><li><strong>Dates.</strong> The application date on the card. The next 10 working days rise.</li>'
      + '<li><strong>Evidence.</strong> A missing daywork sheet, photo, instruction email, or delivery ticket parks the line.</li>'
      + '<li><strong>Draft.</strong> Applied, last certified, and this claim, from the rate card. No rate, no guess.</li>'
      + '<li><strong>Hold.</strong> Short certificate with no written reason, a notice, or a dispute. The director releases every figure.</li></ol>'
      + (state.flash ? '<p class="flash" role="status">' + e(state.flash) + '</p>' : '')
      + '<div class="layout">'
      + renderQueue(today)
      + '<div class="main"><div class="switch">'
      + '<button type="button" data-action="show-queue"' + (state.view === 'queue' ? ' aria-current="true"' : '') + '>This package</button>'
      + '<button type="button" data-action="show-rates"' + (state.view === 'rates' ? ' aria-current="true"' : '') + '>Rate card</button>'
      + '<button type="button" class="texty" data-action="restore">Restore illustration</button>'
      + '</div>'
      + '<p class="store">Stored in this browser only. Nothing is uploaded.</p>'
      + detail
      + '</div></div>';
    if (key) {
      var next = root.querySelector('[data-focuskey="' + key + '"]');
      if (next) {
        next.focus();
        if (selStart != null && next.setSelectionRange && next.type !== 'checkbox') {
          try { next.setSelectionRange(selStart, selEnd); } catch (err) { /* date inputs */ }
        }
      }
    }
    if (!preserveScroll) {
      var detailEl = document.getElementById('detail');
      if (detailEl && detailEl.scrollIntoView) detailEl.scrollIntoView();
    } else {
      window.scrollTo(0, y);
    }
    preserveScroll = true;
  }

  function applyBind(bind, el) {
    var value = el.type === 'checkbox' ? el.checked : el.value;
    if (bind === 'firmName') { state.firmName = el.value; return true; }
    if (bind === 'directorName') { state.directorName = el.value; return true; }
    var pkg = selected();
    if (!pkg) return false;
    if (bind.indexOf('pkg:') === 0) {
      pkg[bind.slice(4)] = el.value;
      return true;
    }
    if (bind.indexOf('rate:') === 0) {
      var rateParts = bind.split(':');
      var rate = state.rates.filter(function (item) { return item.id === rateParts[1]; })[0];
      if (!rate) return false;
      rate[rateParts[2]] = el.value;
      return true;
    }
    if (bind.indexOf('line:') === 0) {
      var parts = bind.split(':');
      var line = findLine(parts[1]);
      if (!line) return false;
      if (parts[2] === 'ev') {
        var slot = line.evidence[parts[3]];
        if (!slot) return false;
        if (parts[4] === 'needed' || parts[4] === 'present') slot[parts[4]] = !!value;
        else slot.ref = el.value;
        return true;
      }
      if (parts[2] === 'noticeRisk' || parts[2] === 'disputeMentioned') {
        var turningOff = !!line[parts[2]] && !value;
        if (turningOff) {
          var warning = parts[2] === 'noticeRisk'
            ? 'Untick only if you have dealt with this outside ApplyQueue. ApplyQueue does not say whether a right is kept or lost. Nothing is sent. Continue?'
            : 'Untick only if you have dealt with this outside ApplyQueue. This is not a dispute process. Nothing is sent. Continue?';
          if (!window.confirm(warning)) return false;
        }
        line[parts[2]] = !!value;
        return true;
      }
      line[parts[2]] = el.value;
      return true;
    }
    return false;
  }

  function onField(event) {
    var el = event.target;
    if (!el.dataset || !el.dataset.bind) return;
    var choice = el.type === 'checkbox' || el.tagName === 'SELECT' || el.type === 'date';
    if (choice && event.type !== 'change') return;
    if (!choice && event.type !== 'input') return;
    state.flash = '';
    if (!applyBind(el.dataset.bind, el)) {
      render();
      return;
    }
    save();
    render();
  }

  function onClick(event) {
    var el = event.target.closest('[data-action]');
    if (!el || el.disabled) return;
    var action = el.getAttribute('data-action');
    var pkg = selected();
    state.flash = '';
    if (action === 'checkout') {
      state.flash = 'Checkout is not open.';
      save();
      render();
      return;
    }
    if (action === 'select-package') {
      state.selectedId = el.getAttribute('data-id');
      state.view = 'queue';
      preserveScroll = false;
      save();
      render();
      return;
    }
    if (action === 'show-queue') { state.view = 'queue'; save(); render(); return; }
    if (action === 'show-rates') { state.view = 'rates'; save(); render(); return; }
    if (action === 'add-package') {
      if (!AQ.canAddLive(state.packages)) {
        state.flash = 'This plan covers up to 4 live packages. Close one before adding another.';
        save();
        render();
        return;
      }
      var created = {
        id: uid('pkg'),
        illustration: false,
        live: true,
        name: '',
        reference: '',
        mainContractor: '',
        site: '',
        applicationDue: '',
        certificateExpected: '',
        certifier: '',
        evidenceLives: '',
        note: '',
        lines: []
      };
      state.packages.push(created);
      state.selectedId = created.id;
      state.view = 'queue';
      preserveScroll = false;
      save();
      render();
      return;
    }
    if (action === 'close-package' && pkg) {
      if (!window.confirm('Close this package? It leaves the live queue and frees a slot. Nothing is sent.')) return;
      pkg.live = false;
      save();
      render();
      return;
    }
    if (action === 'reopen-package' && pkg) {
      if (!AQ.canAddLive(state.packages)) {
        state.flash = 'This plan covers up to 4 live packages. Close another before reopening this one.';
        save();
        render();
        return;
      }
      pkg.live = true;
      save();
      render();
      return;
    }
    if (action === 'remove-package' && pkg) {
      if (!window.confirm('Remove this package from this browser? Nothing is sent.')) return;
      state.packages = state.packages.filter(function (item) { return item.id !== pkg.id; });
      state.selectedId = state.packages.length ? state.packages[0].id : '';
      save();
      render();
      return;
    }
    if (action === 'add-line' && pkg) {
      pkg.lines.push(blankLine());
      save();
      render();
      return;
    }
    if (action === 'remove-line') {
      if (!pkg) return;
      if (!window.confirm('Remove this line from this browser? Nothing is sent.')) return;
      pkg.lines = pkg.lines.filter(function (line) { return line.id !== el.getAttribute('data-line'); });
      save();
      render();
      return;
    }
    if (action === 'release') {
      var line = findLine(el.getAttribute('data-line'));
      var which = el.getAttribute('data-which');
      if (!line || AQ.FIG_KEYS.indexOf(which) === -1) return;
      if (!window.confirm('Release this figure? It stays in this queue. It is not sent.')) return;
      var result = AQ.tryRelease(line, state.rates, which, {
        now: new Date().toISOString(),
        by: state.directorName.trim() || 'Director'
      });
      if (!result.ok) state.flash = result.reason || 'That figure cannot be released.';
      save();
      render();
      return;
    }
    if (action === 'withdraw') {
      var held = findLine(el.getAttribute('data-line'));
      var key = el.getAttribute('data-which');
      if (!held || AQ.FIG_KEYS.indexOf(key) === -1) return;
      if (!window.confirm('Withdraw this release? Nothing was sent.')) return;
      AQ.withdrawRelease(held, key);
      save();
      render();
      return;
    }
    if (action === 'add-rate') {
      state.rates.push({ id: uid('rate'), code: '', description: '', unit: '', amountText: '' });
      save();
      render();
      return;
    }
    if (action === 'remove-rate') {
      var rateId = el.getAttribute('data-rate');
      if (!window.confirm('Remove this rate? Lines that use it will have no price. Nothing is guessed, and nothing is sent.')) return;
      state.rates = state.rates.filter(function (rate) { return rate.id !== rateId; });
      state.packages.forEach(function (item) {
        item.lines.forEach(function (line) {
          if (line.rateId === rateId) line.rateId = '';
        });
      });
      save();
      render();
      return;
    }
    if (action === 'restore') {
      if (!window.confirm('Replace the queue in this browser with the illustration packages? Nothing is sent.')) return;
      state = AQ.seed();
      save();
      preserveScroll = false;
      render();
      return;
    }
    if (action === 'mark-package-real' && pkg) {
      if (!window.confirm('Only do this after you have replaced the example with your own job. Example Electrical is not a real firm.')) return;
      pkg.illustration = false;
      pkg.lines.forEach(function (line) { line.illustration = false; });
      save();
      render();
      return;
    }
    if (action === 'mark-rates-real') {
      if (!window.confirm('Only do this if these rates are the firm’s own. Blank prices will still not be guessed.')) return;
      state.ratesIllustration = false;
      save();
      render();
      return;
    }
  }

  state = load();
  root.addEventListener('input', onField);
  root.addEventListener('change', onField);
  root.addEventListener('click', onClick);
  render();
})();

/* Second Look — screens and interaction.
 *
 * One state object, one render() per change. Screens:
 *   start -> loading -> verdict (with "Why?" on demand)
 *                    -> guess -> compare   (second-look prompt)
 *                    -> error              (no answer: retry, demo mode or edit)
 *   summary (from "End session")
 */
(function (SL) {
  'use strict';

  var verdicts = SL.verdicts;
  var hedges = SL.hedges;
  var config = window.SECOND_LOOK_CONFIG;
  var tracker = SL.reliance.createTracker();

  var MAX_LENGTH = config.maxClaimLength;
  var DOUBLE_CLICK_MS = 400; // clicks this soon after a screen change are ignored
  var demoMode = !config.apiUrl;

  // Demo shortcut: open the page with ?demoStreak=1 to skip the five quick agrees.
  var streakShortcut = new URLSearchParams(window.location.search).get('demoStreak') === '1';
  if (streakShortcut) tracker.primeStreak();

  var EXAMPLES = [
    'Hal Jordan is a Marvel character',
    'The Eiffel Tower grows taller in summer',
    'Cracking your knuckles causes arthritis'
  ];

  var FOOTER_DEFAULT = 'The AI can make mistakes. Its confidence is its own estimate, not a guarantee.';
  var FOOTER_SUMMARY = 'This summary covers this session only.';

  var mainEl = document.getElementById('main');
  var footerEl = document.getElementById('footer');
  var countEl = document.getElementById('claims-count');
  var endSessionEl = document.getElementById('end-session');
  var demoBadgeEl = document.getElementById('demo-badge');
  var pauseEl = document.getElementById('pause-toggle');
  var announcerEl = document.getElementById('announcer');

  var state = freshState();
  var pending = null;   // the in-flight AI request, if any
  var screenChangedAt = 0;

  function freshState() {
    return {
      view: 'start',
      draft: '',
      claim: '',
      errorKind: '',
      result: null,
      hedge: null,        // { id, text } wording shown above the verdict
      whyOpen: false,
      whyOpened: false,
      shownAt: 0,
      escalated: false,
      entry: null,        // logged entry for the compare screen
      triggerInfoOpen: false
    };
  }

  // ---------- helpers ----------

  function esc(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function quote(claim) {
    return '“' + esc(claim) + '”';
  }

  function hedgeLine(extraClass) {
    if (!state.hedge) return '';
    return '<p class="hedge' + (extraClass ? ' ' + extraClass : '') + '">' + esc(state.hedge.text) + '</p>';
  }

  function pauseLabel() {
    return tracker.isPaused() ? 'Resume second-look prompts' : 'Pause second-look prompts';
  }

  function badge(result, extraClass) {
    return '<span class="badge badge--' + result.level.toLowerCase() + (extraClass ? ' ' + extraClass : '') + '">' +
      result.level + ' confidence · ' + result.confidence + '%</span>';
  }

  function claimCard(large) {
    return '<div class="card claim-card' + (large ? ' claim-card--large' : '') + '">' +
      '<span class="eyebrow">Your claim</span>' +
      '<p class="claim-card__text">' + quote(state.claim) + '</p>' +
      '</div>';
  }

  function whyPanel(result) {
    return '<section class="why-panel" aria-labelledby="why-title">' +
      '<div class="why-panel__head">' +
        '<h2 class="why-panel__title" id="why-title" tabindex="-1" data-focus>Why the AI said this</h2>' +
        '<button type="button" class="btn--text" data-action="hide-why">Hide</button>' +
      '</div>' +
      '<ul class="why-panel__list">' +
        result.reasons.map(function (r) { return '<li>' + esc(r) + '</li>'; }).join('') +
      '</ul>' +
      '<span class="why-panel__source">' + esc(result.note) + '</span>' +
      '</section>';
  }

  function seconds(value) {
    return String(Math.max(1, Math.round(value)));
  }

  function cleanClaim(text) {
    var claim = String(text).replace(/\s+/g, ' ').trim();
    // Drop quote marks pasted around the claim; the claim card adds its own.
    return claim.replace(/^["“”']+|["“”']+$/g, '').trim();
  }

  function lengthMessage(length) {
    if (length >= MAX_LENGTH) {
      return 'That’s the ' + MAX_LENGTH + ' character limit. Trim it down to one short claim.';
    }
    return length + ' / ' + MAX_LENGTH;
  }

  function announce(message) {
    announcerEl.textContent = '';
    // Let the empty value land first so a repeated message is read again.
    setTimeout(function () { announcerEl.textContent = message; }, 50);
  }

  // ---------- screens ----------

  function startView() {
    return '<div class="column column--start">' +
      '<div class="intro">' +
        '<span class="pill">Have a second look</span>' +
        '<h1 class="title">Seen a claim or an AI answer? Check it here.</h1>' +
        '<p class="lede">Paste it below. The AI will tell you what it thinks and how sure it is. The final call is yours.</p>' +
      '</div>' +
      '<form class="card card--raised claim-form" data-form="claim" novalidate>' +
        '<label class="field-label" for="claim">Claim or AI answer to check</label>' +
        '<textarea class="claim-input" id="claim" name="claim" rows="4" maxlength="' + MAX_LENGTH + '"' +
          ' aria-describedby="claim-hint claim-length"' +
          ' placeholder="e.g. “Cristiano Ronaldo has 6 Ballon d’Ors”">' +
          esc(state.draft) + '</textarea>' +
        '<span class="hint claim-length" id="claim-length" role="status"></span>' +
        '<div class="claim-form__footer">' +
          '<span class="hint" id="claim-hint"></span>' +
          '<button type="submit" class="btn btn--primary btn--wide" id="claim-submit">Take a second look</button>' +
        '</div>' +
      '</form>' +
      (streakShortcut && tracker.shouldEscalate('Low')
        ? '<p class="shortcut-note">Shortcut on (?demoStreak=1): the next Medium or Low confidence answer ' +
          'will show the second-look prompt. Try “The Eiffel Tower grows taller in summer”.</p>'
        : '') +
      '<div class="examples">' +
        '<span class="field-label" id="examples-label">Not sure what to check? Try one of these</span>' +
        '<div class="chip-row" role="group" aria-labelledby="examples-label">' +
          EXAMPLES.map(function (example, i) {
            return '<button type="button" class="chip" data-action="use-example" data-index="' + i + '">' + esc(example) + '</button>';
          }).join('') +
        '</div>' +
      '</div>' +
    '</div>';
  }

  function loadingView() {
    return '<div class="column column--loading">' +
      claimCard(true) +
      '<div class="card loading-card">' +
        '<div class="loading-status">' +
          '<svg class="spinner" width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden="true">' +
            '<circle cx="14" cy="14" r="11" stroke="#E3D3DB" stroke-width="3.5"></circle>' +
            '<path d="M14 3 A11 11 0 0 1 25 14" stroke="#5C3346" stroke-width="3.5" stroke-linecap="round"></path>' +
          '</svg>' +
          '<div class="loading-status__text">' +
            '<span class="loading-status__title">Taking a look…</span>' +
            '<span class="loading-status__detail">The AI is weighing up this claim. This usually takes a few seconds.</span>' +
          '</div>' +
        '</div>' +
        '<div class="skeleton" aria-hidden="true">' +
          '<div class="skeleton__line skeleton__line--title"></div>' +
          '<div class="skeleton__line skeleton__line--bar"></div>' +
          '<div class="skeleton__line skeleton__line--text"></div>' +
        '</div>' +
        '<div class="button-row">' +
          '<button type="button" class="btn btn--primary" disabled>Agree</button>' +
          '<button type="button" class="btn btn--outline" disabled>Disagree</button>' +
          '<button type="button" class="btn btn--soft" disabled>Why does the AI think this?</button>' +
        '</div>' +
      '</div>' +
      '<button type="button" class="link-button link-button--start" data-action="cancel" data-focus>Cancel</button>' +
    '</div>';
  }

  function verdictView() {
    var result = state.result;
    var level = result.level.toLowerCase();
    var open = state.whyOpen;

    var decisionButtons =
      '<button type="button" class="btn btn--primary" data-action="agree">Agree</button>' +
      '<button type="button" class="btn btn--outline" data-action="disagree">Disagree</button>';

    return '<div class="column' + (open ? '' : ' column--verdict') + '">' +
      claimCard(!open) +
      '<div class="card card--raised verdict-card' + (open ? ' verdict-card--why-open' : '') + '">' +
        '<div class="verdict-head">' +
          '<div class="verdict-head__label">' +
            '<span class="eyebrow">The AI\'s verdict</span>' +
            hedgeLine() +
            '<h1 class="verdict-word" tabindex="-1"' + (open ? '' : ' data-focus') + '>' + result.verdict + '</h1>' +
          '</div>' +
          badge(result) +
        '</div>' +
        '<div class="meter-block">' +
          '<div class="meter" role="img" aria-label="Confidence ' + result.confidence + ' percent">' +
            '<div class="meter__fill meter__fill--' + level + '" style="width: ' + result.confidence + '%"></div>' +
          '</div>' +
          (result.malformed
            ? '<span class="note note--strong">' + esc(result.note) + '</span>'
            : (open ? '' : '<span class="note">This is the AI\'s own estimate of how sure it is. It can still be wrong.</span>')) +
        '</div>' +
        (open ? whyPanel(result) : '') +
        '<div class="button-row' + (open ? '' : ' button-row--spaced') + '">' +
          decisionButtons +
          (open ? '' : '<button type="button" class="btn btn--soft" data-action="show-why" aria-expanded="false">Why does the AI think this?</button>') +
        '</div>' +
      '</div>' +
      (open ? '' :
        '<div class="legend">' +
          '<span class="eyebrow">How to read confidence:</span>' +
          '<span class="badge badge--small badge--high">High · 70–100%</span>' +
          '<span class="badge badge--small badge--medium">Medium · 40–69%</span>' +
          '<span class="badge badge--small badge--low">Low · under 40%</span>' +
        '</div>') +
    '</div>';
  }

  function guessView() {
    return '<div class="column">' +
      '<div class="prompt-banner">' +
        '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#F4EAEF" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
          '<circle cx="6.5" cy="13" r="4.5"></circle><circle cx="17.5" cy="13" r="4.5"></circle><path d="M11 12 Q12 11 13 12"></path>' +
        '</svg>' +
        '<div class="prompt-banner__text">' +
          '<h1 class="prompt-banner__title" tabindex="-1" data-focus>Time for a second look</h1>' +
          '<span class="prompt-banner__body">You\'ve agreed with the last ' + tracker.config.STREAK_LENGTH +
            ' answers quickly. The AI is less sure about this one, so make your own call first.</span>' +
        '</div>' +
      '</div>' +
      claimCard(false) +
      '<div class="hidden-answer">' +
        '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#5C3346" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
          '<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"></path>' +
          '<path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"></path>' +
          '<line x1="1" y1="1" x2="23" y2="23"></line>' +
        '</svg>' +
        '<span class="hidden-answer__text">The AI\'s answer is hidden until you decide</span>' +
      '</div>' +
      '<div class="guess">' +
        '<span class="guess__question" id="guess-question">What do you think?</span>' +
        '<div class="button-row" role="group" aria-labelledby="guess-question">' +
          '<button type="button" class="btn btn--outline" data-action="guess" data-guess="TRUE">I think it\'s TRUE</button>' +
          '<button type="button" class="btn btn--outline" data-action="guess" data-guess="FALSE">I think it\'s FALSE</button>' +
          '<button type="button" class="btn btn--soft" data-action="guess" data-guess="NOT SURE">Not sure</button>' +
        '</div>' +
        '<button type="button" class="link-button link-button--start" data-action="toggle-trigger-info"' +
          ' aria-expanded="' + state.triggerInfoOpen + '" aria-controls="trigger-info">Why am I seeing this?</button>' +
        '<p class="trigger-info" id="trigger-info"' + (state.triggerInfoOpen ? '' : ' hidden') + '>' +
          'You agreed ' + tracker.config.STREAK_LENGTH + ' times in a row, each in under ' + tracker.config.QUICK_SECONDS +
          ' seconds, without opening “Why?”. When that happens and the AI is not highly confident about the next claim, ' +
          'Second Look asks for your view first so you can compare.' +
        '</p>' +
        '<div class="trigger-info__pause" id="trigger-pause"' + (state.triggerInfoOpen ? '' : ' hidden') + '>' +
          '<button type="button" class="btn btn--soft btn--small" data-action="toggle-pause">' + pauseLabel() + '</button>' +
          '<span class="hint">' + (tracker.isPaused()
            ? 'Paused. You won’t be asked again until you resume. This claim still needs your call.'
            : 'Pausing starts with the next claim. This one still needs your call.') + '</span>' +
        '</div>' +
      '</div>' +
    '</div>';
  }

  function compareMessage(entry, result) {
    var unsureNote = result.level === 'Low'
      ? 'The AI isn\'t very sure here either.'
      : 'The AI is only fairly sure here.';
    var next = ' It\'s worth checking its reasoning or another source before deciding.';

    if (result.verdict === 'UNCLEAR') {
      return { title: 'The AI couldn\'t call this one', body: 'It did not reach a TRUE or FALSE answer.' + next };
    }
    if (entry.ownCall === 'NOT SURE') {
      return { title: 'You weren\'t sure', body: unsureNote + next };
    }
    if (entry.ownCall === result.verdict) {
      return {
        title: 'You and the AI agree',
        body: unsureNote + ' Agreeing doesn\'t settle it, so it\'s still worth checking its reasoning or another source.'
      };
    }
    return { title: 'You and the AI disagree', body: unsureNote + next };
  }

  function compareView() {
    var result = state.result;
    var entry = state.entry;
    var message = compareMessage(entry, result);

    return '<div class="column">' +
      claimCard(false) +
      '<div class="compare">' +
        '<div class="card compare__card compare__card--yours">' +
          '<span class="eyebrow">Your call</span>' +
          '<span class="compare__value">' + esc(entry.ownCall) + '</span>' +
          '<span class="note">Made before seeing the AI</span>' +
        '</div>' +
        '<div class="card compare__card">' +
          '<span class="eyebrow">The AI\'s verdict</span>' +
          hedgeLine('hedge--small') +
          '<span class="compare__value">' + result.verdict + '</span>' +
          badge(result, 'badge--small badge--start') +
        '</div>' +
      '</div>' +
      '<div class="callout">' +
        '<h1 class="callout__title" tabindex="-1"' + (state.whyOpen ? '' : ' data-focus') + '>' + message.title + '</h1>' +
        '<span class="callout__body">' + message.body + '</span>' +
      '</div>' +
      (state.whyOpen ? whyPanel(result) : '') +
      '<div class="button-row">' +
        (state.whyOpen ? '' : '<button type="button" class="btn btn--soft" data-action="show-why" aria-expanded="false">Why does the AI think this?</button>') +
        '<button type="button" class="btn btn--primary" data-action="next-claim">Check another claim</button>' +
      '</div>' +
    '</div>';
  }

  function actionLabel(entry) {
    var why = entry.whyOpened ? ', opened Why?' : '';
    if (entry.choice === 'own-call') {
      var said = entry.ownCall === 'NOT SURE' ? 'you weren\'t sure' : 'you said ' + entry.ownCall;
      return 'Second-look prompt · ' + said + why;
    }
    return (entry.choice === 'agree' ? 'Agreed' : 'Disagreed') + why;
  }

  function summaryView() {
    var stats = tracker.stats();
    var entries = tracker.entries();

    function stat(value, label, accent) {
      return '<div class="stat' + (accent ? ' stat--accent' : '') + '"><dt>' + label + '</dt><dd>' + value + '</dd></div>';
    }

    var rows = entries.length
      ? entries.map(function (e) {
          return '<tr' + (e.escalated ? ' class="log-table__row--prompted"' : '') + '>' +
            '<td class="claim-cell">' + esc(e.claim) + '</td>' +
            '<td>' + e.verdict + '</td>' +
            '<td>' + e.level + ' · ' + e.confidence + '%</td>' +
            '<td class="action-cell">' + esc(actionLabel(e)) + '</td>' +
            '<td class="num">' + seconds(e.decisionSeconds) + '</td>' +
          '</tr>';
        }).join('')
      : '<tr><td class="log-table__empty" colspan="5">No claims checked this session.</td></tr>';

    return '<div class="column column--wide">' +
      '<div class="summary-head">' +
        '<h1 class="title title--summary" tabindex="-1" data-focus>How you used the AI this session</h1>' +
        '<p class="lede lede--summary">A look back at your choices. Nothing here says whether the AI was right.</p>' +
      '</div>' +
      '<dl class="stats">' +
        stat(stats.checked, 'Claims checked') +
        stat(stats.agreed, 'Agreed with the AI') +
        stat(stats.disagreed, 'Disagreed') +
        stat(stats.whyOpened, 'Opened “Why?”') +
        stat(stats.escalated, 'Second-look prompts', true) +
      '</dl>' +
      (stats.whilePaused
        ? '<p class="note">Second-look prompts were paused for ' + stats.whilePaused + ' of ' + stats.checked +
          ' decision' + (stats.checked === 1 ? '' : 's') + '.</p>'
        : '') +
      '<div class="table-wrap" tabindex="0" role="region" aria-label="Session log">' +
        '<table class="log-table">' +
          '<thead><tr>' +
            '<th scope="col">Claim</th>' +
            '<th scope="col">AI verdict</th>' +
            '<th scope="col">Confidence</th>' +
            '<th scope="col">What you did</th>' +
            '<th scope="col" class="num">Time (seconds)</th>' +
          '</tr></thead>' +
          '<tbody>' + rows + '</tbody>' +
        '</table>' +
      '</div>' +
      '<div class="button-row">' +
        '<button type="button" class="btn btn--outline" data-action="download-csv"' + (entries.length ? '' : ' disabled') + '>Download log (CSV)</button>' +
        '<button type="button" class="btn btn--primary" data-action="new-session">Start a new session</button>' +
      '</div>' +
    '</div>';
  }

  var ERRORS = {
    timeout: {
      title: 'The AI took too long to answer',
      body: 'Nothing came back in time. Your claim has not been checked.'
    },
    server: {
      title: 'The AI service had a problem',
      body: 'It returned an error instead of an answer. Your claim has not been checked.'
    },
    network: {
      title: 'Couldn’t reach the AI',
      body: 'The connection to the AI service failed. Check your internet connection. Your claim has not been checked.'
    },
    demo: {
      title: 'Couldn’t load the demo answers',
      body: 'The file of prepared answers did not load. If you opened index.html straight from a folder, ' +
        'open it through a local server instead (see the README).'
    }
  };

  function errorView() {
    var error = ERRORS[demoMode ? 'demo' : state.errorKind] || ERRORS.network;
    return '<div class="column column--loading">' +
      claimCard(true) +
      '<div class="card error-card" role="alert">' +
        '<h1 class="error-card__title" tabindex="-1" data-focus>' + error.title + '</h1>' +
        '<p class="error-card__body">' + error.body + '</p>' +
        '<div class="button-row">' +
          '<button type="button" class="btn btn--primary" data-action="retry">Try again</button>' +
          (demoMode ? '' : '<button type="button" class="btn btn--outline" data-action="use-demo">Use demo mode instead</button>') +
          '<button type="button" class="btn btn--soft" data-action="edit-claim">Edit claim</button>' +
        '</div>' +
      '</div>' +
    '</div>';
  }

  var VIEWS = {
    start: startView,
    loading: loadingView,
    verdict: verdictView,
    guess: guessView,
    compare: compareView,
    error: errorView,
    summary: summaryView
  };

  var TITLES = {
    start: 'Second Look',
    loading: 'Taking a look… · Second Look',
    verdict: 'The AI\'s verdict · Second Look',
    guess: 'Time for a second look · Second Look',
    compare: 'Your call vs the AI · Second Look',
    error: 'No answer · Second Look',
    summary: 'Session summary · Second Look'
  };

  // ---------- render ----------

  /** Start screen: keep the button, hint and length message in step with the textarea. */
  function syncClaimForm() {
    var input = document.getElementById('claim');
    if (!input) return;
    var empty = cleanClaim(input.value) === '';
    var atLimit = input.value.length >= MAX_LENGTH;

    document.getElementById('claim-submit').disabled = empty;
    document.getElementById('claim-hint').textContent = empty
      ? 'Type or paste a claim to check it.'
      : 'Works best with one claim at a time.';

    var lengthEl = document.getElementById('claim-length');
    lengthEl.textContent = input.value.length ? lengthMessage(input.value.length) : '';
    lengthEl.classList.toggle('claim-length--limit', atLimit);
  }

  function render(options) {
    var view = state.view;

    mainEl.className = 'site-main site-main--' + view;
    mainEl.setAttribute('aria-busy', view === 'loading' ? 'true' : 'false');
    mainEl.innerHTML = VIEWS[view]();
    if (view === 'start') syncClaimForm();

    footerEl.textContent = view === 'summary' ? FOOTER_SUMMARY : FOOTER_DEFAULT;
    endSessionEl.hidden = view === 'summary';
    pauseEl.hidden = view === 'summary';
    pauseEl.textContent = pauseLabel();
    demoBadgeEl.hidden = !demoMode;
    document.title = TITLES[view];

    // The claim on screen counts as checked once its verdict (or prompt) is showing.
    var onScreen = (view === 'verdict' || view === 'guess') ? 1 : 0;
    countEl.textContent = tracker.stats().checked + onScreen;

    if (options && options.keepFocus) return;
    var target = (options && options.focus && mainEl.querySelector(options.focus)) ||
      mainEl.querySelector('[data-focus]');
    if (target) target.focus();
  }

  function go(view, changes, options) {
    state.view = view;
    Object.keys(changes || {}).forEach(function (key) { state[key] = changes[key]; });
    screenChangedAt = Date.now();
    render(options);
    window.scrollTo(0, 0);
  }

  // ---------- actions ----------

  function submitClaim() {
    if (state.view !== 'start') return;
    var claim = cleanClaim(document.getElementById('claim').value).slice(0, MAX_LENGTH);
    if (!claim) return; // the button is disabled; this covers Ctrl+Enter
    askAbout(claim);
  }

  function askAbout(claim) {
    cancelPending();
    go('loading', {
      claim: claim, draft: '', errorKind: '', result: null, hedge: null, entry: null,
      whyOpen: false, whyOpened: false, escalated: false, triggerInfoOpen: false
    });
    announce('Taking a look. The AI is weighing up this claim.');

    var request = verdicts.check(claim, {
      demo: demoMode,
      apiUrl: config.apiUrl,
      demoDataUrl: config.demoDataUrl,
      timeoutMs: config.timeoutMs
    });
    pending = request;

    request.promise.then(function (result) {
      if (pending !== request) return; // cancelled or superseded
      pending = null;
      var escalated = tracker.beginClaim(result.level);
      // No hedge for an unreadable reply: the AI did not say anything we can put into words.
      var hedge = result.malformed ? null : hedges.pickHedge(result.level, result.verdict);
      go(escalated ? 'guess' : 'verdict', { result: result, hedge: hedge, escalated: escalated, shownAt: Date.now() });
    }, function (error) {
      if (pending !== request) return;
      pending = null;
      go('error', { errorKind: error.kind || 'network' });
    });
  }

  function cancelPending() {
    if (pending) {
      pending.cancel();
      pending = null;
    }
  }

  function backToStart(draft, message) {
    go('start', { draft: draft || '', claim: '', result: null, hedge: null, whyOpen: false, entry: null }, { focus: '#claim' });
    if (message) announce(message);
  }

  /** Log the decision for the claim on screen. Returns null if it was already logged. */
  function recordDecision(choice, ownCall) {
    if (!state.result || state.entry) return null;
    var result = state.result;
    state.entry = tracker.record({
      claim: state.claim,
      verdict: result.verdict,
      confidence: result.confidence,
      level: result.level,
      hedgeVariant: state.hedge ? state.hedge.id : '',
      choice: choice,
      ownCall: ownCall,
      whyOpened: state.whyOpened,
      decisionSeconds: (Date.now() - state.shownAt) / 1000,
      escalated: state.escalated
    });
    return state.entry;
  }

  function decide(choice) {
    if (!recordDecision(choice)) return;
    backToStart('', 'Logged: you ' + (choice === 'agree' ? 'agreed' : 'disagreed') + ' with the AI. Ready for another claim.');
  }

  var actions = {
    'use-example': function (el) {
      state.draft = EXAMPLES[Number(el.dataset.index)];
      render({ focus: '#claim' });
    },

    'cancel': function () {
      var claim = state.claim;
      cancelPending();
      backToStart(claim, 'Check cancelled.');
    },

    'retry': function () { askAbout(state.claim); },

    'use-demo': function () {
      demoMode = true;
      askAbout(state.claim);
    },

    'edit-claim': function () { backToStart(state.claim); },

    'show-why': function () {
      state.whyOpen = true;
      if (!state.whyOpened) {
        state.whyOpened = true;
        tracker.noteWhyOpened(state.entry); // on the compare screen this also flags the logged row
      }
      render();
    },

    'hide-why': function () {
      state.whyOpen = false;
      render({ focus: '[data-action="show-why"]' });
    },

    'agree': function () { decide('agree'); },
    'disagree': function () { decide('disagree'); },

    'guess': function (el) {
      if (recordDecision('own-call', el.dataset.guess)) go('compare', { whyOpened: false });
    },

    'toggle-trigger-info': function () {
      state.triggerInfoOpen = !state.triggerInfoOpen;
      render({ focus: '[data-action="toggle-trigger-info"]' });
    },

    'toggle-pause': function (el) {
      tracker.setPaused(!tracker.isPaused());
      announce(tracker.isPaused() ? 'Second-look prompts paused.' : 'Second-look prompts resumed.');
      if (mainEl.contains(el)) {
        render({ focus: '#main [data-action="toggle-pause"]' });
      } else {
        // Header button: keep focus where it is, and refresh the panel copy if it is on screen.
        pauseEl.textContent = pauseLabel();
        if (state.view === 'guess') render({ keepFocus: true });
      }
    },

    'next-claim': function () { backToStart(''); },

    'end-session': function () {
      cancelPending();
      go('summary', { whyOpen: false });
    },

    'new-session': function () {
      tracker.reset();
      if (streakShortcut) tracker.primeStreak();
      state = freshState();
      go('start', {}, { focus: '#claim' });
      announce('New session started.');
    },

    'download-csv': function () {
      var blob = new Blob(['﻿' + tracker.toCSV()], { type: 'text/csv;charset=utf-8' });
      var url = URL.createObjectURL(blob);
      var link = document.createElement('a');
      link.href = url;
      link.download = 'second-look-session-' + new Date().toISOString().slice(0, 10) + '.csv';
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    }
  };

  // ---------- wiring ----------

  /**
   * The second click of a double-click lands on the next screen; ignore it.
   * Only applies inside <main>: header buttons stay in the same place on every screen.
   */
  function tooSoon() {
    return Date.now() - screenChangedAt < DOUBLE_CLICK_MS;
  }

  document.addEventListener('click', function (event) {
    var el = event.target.closest('[data-action]');
    if (!el || el.disabled) return;
    if (mainEl.contains(el) && tooSoon()) return;
    var handler = actions[el.dataset.action];
    if (handler) handler(el);
  });

  mainEl.addEventListener('submit', function (event) {
    if (event.target.matches('[data-form="claim"]')) {
      event.preventDefault();
      if (!tooSoon()) submitClaim();
    }
  });

  // Ctrl/Cmd + Enter submits from the claim box.
  mainEl.addEventListener('keydown', function (event) {
    if (event.target.id === 'claim' && event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      submitClaim();
    }
  });

  mainEl.addEventListener('input', function (event) {
    if (event.target.id === 'claim') {
      state.draft = event.target.value;
      syncClaimForm();
    }
  });

  render({ keepFocus: true });

  // When the page is served by `npm start` and a key is set, the server offers live mode.
  // Any other way of opening the page (PyCharm's browser button, a static server) stays in demo mode.
  if (!config.apiUrl && config.serverConfigUrl) {
    fetch(config.serverConfigUrl).then(function (response) {
      return response.ok ? response.json() : null;
    }).then(function (server) {
      if (server && server.live === true) {
        config.apiUrl = config.serverCheckUrl;
        demoMode = false;
        demoBadgeEl.hidden = true;
      }
    }).catch(function () { /* no server: stay in demo mode */ });
  }
})(window.SecondLook = window.SecondLook || {});

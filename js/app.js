// app.js - Main Controller (Enhanced)
class App {
  constructor() {
    this.engine = new NFAEngine();
    this.renderer = new AutomataRenderer();
    this.dfa = null;
    this.minDfa = null;
    this.transitions = {};
    this.states = [];
    this.alphabet = [];
    this.startState = '';
    this.acceptStates = [];
    this.currentTab = 'visualizer';
    this.transitionRows = [];
    this._explanationHistory = [];
    this._explanationTimer = null;
    this._animatingStep = 0;
    this._totalSteps = 0;
  }

  init() {
    this.renderer.init('standard');
    this.renderer.initMin('minimized');
    this.setupTabs();
    this.setupEventListeners();
    this.loadExample();
    this.updateStepLog([]);
  }

  setupTabs() {
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById(`tab-${btn.dataset.tab}`).classList.add('active');
        this.currentTab = btn.dataset.tab;
      });
    });
  }

  setupEventListeners() {
    document.getElementById('btn-convert').addEventListener('click', () => this.convert());
    document.getElementById('btn-clear').addEventListener('click', () => this.clearAll());
    document.getElementById('btn-example').addEventListener('click', () => this.loadExample());
    document.getElementById('btn-simulate').addEventListener('click', () => this.simulateString());

    document.getElementById('input-states').addEventListener('input', () => this.onStatesChanged());
    document.getElementById('input-alphabet').addEventListener('input', () => this.onAlphabetChanged());
    document.getElementById('input-start').addEventListener('input', () => this.onInputChanged());
    document.getElementById('input-accept').addEventListener('input', () => this.onInputChanged());
  }

  onStatesChanged() { this.parseInputs(); this.rebuildTransitionTable(); }
  onAlphabetChanged() { this.parseInputs(); this.rebuildTransitionTable(); }
  onInputChanged() { this.parseInputs(); }

  parseInputs() {
    this.states = document.getElementById('input-states').value.split(',').map(s => s.trim()).filter(Boolean);
    this.alphabet = document.getElementById('input-alphabet').value.split(',').map(a => a.trim()).filter(Boolean);
    this.startState = document.getElementById('input-start').value.trim();
    this.acceptStates = document.getElementById('input-accept').value.split(',').map(s => s.trim()).filter(Boolean);
  }

  rebuildTransitionTable() {
    this.parseInputs();
    const tbody = document.getElementById('transition-tbody');
    tbody.innerHTML = '';
    this.transitionRows = [];
    if (this.states.length === 0) return;

    const allSymbols = [...this.alphabet, 'ε'];
    this.states.forEach(state => {
      const tr = document.createElement('tr');
      const tdState = document.createElement('td');
      tdState.textContent = state;
      tdState.className = 'state-label-cell';
      tr.appendChild(tdState);

      const rowInputs = { state, inputs: {} };
      allSymbols.forEach(sym => {
        const td = document.createElement('td');
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'trans-input';
        input.placeholder = '∅';
        input.dataset.state = state;
        input.dataset.symbol = sym;
        input.addEventListener('input', () => this.collectTransitions());
        td.appendChild(input);
        tr.appendChild(td);
        rowInputs.inputs[sym] = input;
      });

      this.transitionRows.push(rowInputs);
      tbody.appendChild(tr);
    });

    const thead = document.getElementById('transition-thead');
    thead.innerHTML = '';
    const headerRow = document.createElement('tr');
    const thState = document.createElement('th');
    thState.textContent = 'State';
    headerRow.appendChild(thState);
    [...this.alphabet, 'ε'].forEach(sym => {
      const th = document.createElement('th');
      th.textContent = sym;
      headerRow.appendChild(th);
    });
    thead.appendChild(headerRow);
    this.collectTransitions();
  }

  collectTransitions() {
    this.transitions = {};
    document.querySelectorAll('.trans-input').forEach(input => {
      const state = input.dataset.state;
      const symbol = input.dataset.symbol;
      const val = input.value.trim();
      if (!this.transitions[state]) this.transitions[state] = {};
      if (val && val !== '∅') {
        this.transitions[state][symbol] = val.split(',').map(s => s.trim()).filter(Boolean);
      } else {
        this.transitions[state][symbol] = [];
      }
    });
  }

  convert() {
    this.parseInputs();
    this.collectTransitions();

    if (!this.startState || this.states.length === 0 || this.alphabet.length === 0) {
      this.showToast('Please fill in all NFA fields.', 'error'); return;
    }
    if (!this.states.includes(this.startState)) {
      this.showToast('Start state must be in the states list.', 'error'); return;
    }

    const nfaData = { states: this.states, alphabet: this.alphabet, startState: this.startState,
      acceptStates: this.acceptStates, transitions: this.transitions };

    this.engine.setNFA(this.states, this.alphabet, this.startState, this.acceptStates, this.transitions);
    this.renderer.renderNFA(nfaData);

    this.dfa = this.engine.convertToDFA();
    this.minDfa = this.engine.minimizeDFA(this.dfa);

    // Animate standard DFA with live explanation
    this._explanationHistory = [];
    this._animatingStep = 0;
    this._totalSteps = this.dfa.steps.length;
    this.renderer.renderDFA(this.dfa, true, this.dfa.steps, (step, stepIdx, total) => {
      this._onAnimationStep(step, stepIdx, total);
    }, () => {
      this._onAnimationComplete();
    });

    // Render minimized DFA (no animation, appears after standard)
    const minDelay = this.dfa.steps.length * 420 + 1200;
    setTimeout(() => {
      this.renderer.renderMinDFA(this.minDfa);
      this._renderRegexPanel();
      this._renderMinExplanation();
    }, minDelay);

    this.updateStepLog(this.dfa.steps);
    this.renderDFATable(this.dfa);
    this.renderMinDFATable(this.minDfa);

    document.querySelector('[data-tab="dfa"]').click();
    this.showToast('Conversion started! → DFA tab', 'success');
  }

  // ── LIVE EXPLANATION SYSTEM ──
  _buildExplanation(step, stepIdx, total) {
    const pct = Math.round((stepIdx / total) * 100);
    let title = '', body = '', detail = '', badge = '';

    if (step.type === 'start') {
      badge = 'INIT';
      title = 'Computing the Starting State';
      body = `Every DFA conversion begins by figuring out where the machine starts. In an NFA, when you're at the start state, you might be able to jump to other states for free — these "free jumps" are called ε (epsilon) transitions, because they happen without reading any symbol from the input.`;
      detail = `We compute the ε-closure of the NFA's start state <code>${this.startState}</code>. The ε-closure is the set of ALL states reachable from <code>${this.startState}</code> by following only ε-arrows (zero or more hops). This entire set becomes the DFA's first state: <strong>${step.dfaState}</strong>. Think of it like saying "the DFA starts in every NFA state we can reach before reading anything."`;
    } else if (step.type === 'new_state') {
      badge = 'NEW STATE';
      title = 'A Brand New DFA State Is Born';
      body = `During conversion, each unique combination of NFA states becomes a single DFA state. We've just discovered a combination we haven't seen before — so it gets added to our DFA as a new state to be processed.`;
      detail = `New DFA state: <strong>${step.dfaState}</strong> — representing NFA states {${step.nfaStates.join(', ')}}. This state hasn't been in our worklist before. We'll now need to figure out where it goes for each symbol in the alphabet. The DFA is growing — we'll keep going until we stop discovering new states.`;
    } else if (step.type === 'dead_state') {
      badge = 'DEAD STATE';
      title = 'The Dead State (Trap State) ∅';
      body = `Sometimes an NFA has no transitions at all for a given symbol from some state. In a DFA, we can't just "leave a state out" — every state must have exactly one outgoing arrow per symbol. So when we'd go nowhere, we create a special trap: the dead state ∅.`;
      detail = `Dead state <strong>∅</strong> represents the empty set — no NFA states are active. Once the DFA enters ∅, it can never escape (all transitions from ∅ go back to ∅). Any string that leads here will ultimately be <strong style="color:#ff5252">rejected</strong>. It's a permanent failure zone.`;
    } else if (step.type === 'transition') {
      const isToEmpty = step.toDFA === '∅';
      const isNewState = step.closure.length > 0;
      badge = 'TRANSITION';
      title = isToEmpty
        ? `Symbol '${step.symbol}': Leads to Dead State`
        : `Computing Where '${step.symbol}' Takes Us`;
      body = isToEmpty
        ? `Reading symbol '${step.symbol}' from DFA state ${step.fromDFA} leads nowhere in the NFA. None of the NFA states in this set have a '${step.symbol}' transition that goes anywhere. In the DFA, this must still be a valid transition — so it goes to the dead state ∅.`
        : `We need to find every NFA state reachable by reading symbol '${step.symbol}' from any of the NFA states in ${step.fromDFA}. After collecting all those states, we also expand through any ε-transitions (free hops) to get the full reachable set.`;
      detail = isToEmpty
        ? `move({${step.fromNFA.join(',')}}, ${step.symbol}) = ∅ → ε-closure(∅) = ∅. Result: <strong>${step.fromDFA}</strong> <span style="color:#8892b0">─[${step.symbol}]→</span> <strong style="color:#ff5252">∅</strong>`
        : `move({${step.fromNFA.join(',')}}, ${step.symbol}) = {${step.moved.join(', ') || '∅'}} → ε-closure = {${step.closure.join(', ')}} = <strong>${step.toDFA}</strong>. ${isNewState && !Object.keys(this.dfa.states).includes(step.toDFA) ? 'This is a state we haven\'t seen yet — it will be queued for further processing.' : 'This state was already known, so we just draw the arrow.'}`;
    }

    return { title, body, detail, badge, pct, stepIdx, total };
  }

  _onAnimationStep(step, stepIdx, total) {
    const exp = this._buildExplanation(step, stepIdx, total);
    this._explanationHistory.push(exp);

    const panel = document.getElementById('live-explanation');
    if (!panel) return;

    // Animate out → in
    panel.classList.remove('exp-visible');
    clearTimeout(this._explanationTimer);
    this._explanationTimer = setTimeout(() => {
      panel.innerHTML = this._renderExplanationHTML(exp, false);
      panel.classList.add('exp-visible');
    }, 120);
  }

  _onAnimationComplete() {
    // Show all explanations combined
    const panel = document.getElementById('live-explanation');
    if (!panel) return;

    clearTimeout(this._explanationTimer);
    panel.classList.remove('exp-visible');
    setTimeout(() => {
      panel.innerHTML = this._renderAllExplanationsHTML();
      panel.classList.add('exp-visible');
      this._renderRegexPanel();
    }, 150);
  }

  _renderExplanationHTML(exp, isFinal) {
    return `
      <div class="exp-header">
        <div class="exp-progress-bar"><div class="exp-progress-fill" style="width:${exp.pct}%"></div></div>
        <div class="exp-meta">
          <span class="exp-badge exp-badge-${exp.badge.toLowerCase().replace(' ','-')}">${exp.badge}</span>
          <span class="exp-counter">Step ${exp.stepIdx + 1} / ${exp.total}</span>
        </div>
      </div>
      <div class="exp-title">${exp.title}</div>
      <div class="exp-body">${exp.body}</div>
      <div class="exp-detail">${exp.detail}</div>
    `;
  }

  _renderAllExplanationsHTML() {
    const steps = this._explanationHistory;
    let html = `
      <div class="exp-complete-header">
        <div class="exp-complete-badge">✓ CONVERSION COMPLETE</div>
        <div class="exp-complete-title">Full Conversion Story — ${steps.length} Steps</div>
        <div class="exp-complete-sub">Here is every decision made during the NFA→DFA conversion, in order.</div>
      </div>
      <div class="exp-complete-list">
    `;
    steps.forEach((exp, i) => {
      html += `
        <div class="exp-complete-item">
          <div class="exp-complete-item-head">
            <span class="exp-badge exp-badge-${exp.badge.toLowerCase().replace(' ','-')}">${exp.badge}</span>
            <span class="exp-item-num">Step ${i + 1}</span>
            <span class="exp-item-title">${exp.title}</span>
          </div>
          <div class="exp-item-body">${exp.body}</div>
          <div class="exp-item-detail">${exp.detail}</div>
        </div>
      `;
    });
    html += '</div>';
    return html;
  }

  _renderMinExplanation() {
    const panel = document.getElementById('min-explanation');
    if (!panel) return;
    const dfa = this.dfa, min = this.minDfa;
    if (!dfa || !min) return;

    const dfaCount = Object.keys(dfa.states).length;
    const minCount = Object.keys(min.states).length;
    const removed  = dfaCount - minCount;
    const stateGroups = Object.entries(min.states)
      .map(([ms, orig]) => {
        const origArr = Array.isArray(orig) ? orig : [ms];
        const trans = Object.entries((min.transitions[ms] || {}))
          .map(([sym, tgt]) => `<code>${sym}\u2192${tgt}</code>`).join('\u2002\u2002') || '(none)';
        return `<div class="exp-complete-item" style="border-left-color:var(--purple)">
          <div class="exp-complete-item-head">
            <span class="exp-badge" style="background:var(--purple-dim);color:var(--purple);border:1px solid var(--purple-mid)">PARTITION</span>
            <span class="exp-item-title">Min state <strong>${ms}</strong></span>
          </div>
          <div class="exp-item-body">Merged DFA states: <strong>{${origArr.join(', ')}}</strong> — indistinguishable by any input string, so they collapse into one.</div>
          <div class="exp-item-detail">Transitions: ${trans}</div>
        </div>`;
      }).join('');

    panel.innerHTML = `
      <div class="exp-complete-header">
        <div class="exp-complete-badge" style="color:var(--purple);background:var(--purple-dim);border-color:var(--purple-mid)">\u2713 MINIMIZATION COMPLETE</div>
        <div class="exp-complete-title">Hopcroft&#39;s Algorithm Result</div>
        <div class="exp-complete-sub">${dfaCount} DFA states \u2192 ${minCount} minimized states &nbsp;\u00b7&nbsp; ${removed} state${removed!==1?'s':''} eliminated</div>
      </div>
      <div style="display:flex;gap:10px;margin:12px 0;flex-wrap:wrap;">
        <div class="exp-complete-item" style="flex:1;min-width:160px;border-left-color:var(--teal)">
          <div class="exp-item-title" style="color:var(--teal)">How it works</div>
          <div class="exp-item-body">Hopcroft&#39;s algorithm starts by splitting states into accepting (F) and non-accepting (Q\u2216F). It then repeatedly checks: for every symbol, do all states in a group lead to the same group? If not, split. Repeat until stable.</div>
        </div>
        <div class="exp-complete-item" style="flex:1;min-width:160px;border-left-color:var(--gold)">
          <div class="exp-item-title" style="color:var(--gold)">Why it matters</div>
          <div class="exp-item-body">Two states are equivalent if no input string can tell them apart. Merging them gives the <strong>smallest possible DFA</strong> that accepts the exact same language &#x2014; saving memory and making the automaton faster to run.</div>
        </div>
      </div>
      <div class="exp-complete-list">${stateGroups}</div>
    `;
    panel.classList.add('exp-visible');
  }

  _renderRegexPanel() {
    const dfaRegex = this.engine.generateRegex(this.dfa);
    const minRegex = this.engine.generateRegex(this.minDfa);

    const p = document.getElementById('regex-panel');
    if (!p) return;
    p.innerHTML = `
      <div class="regex-panel-title">Regular Expressions</div>
      <div class="regex-cards">
        <div class="regex-card">
          <div class="regex-card-label">Standard DFA</div>
          <div class="regex-card-formula" id="regex-dfa">${dfaRegex}</div>
          <div class="regex-card-note">${Object.keys(this.dfa.states).length} states</div>
        </div>
        <div class="regex-card regex-card-min">
          <div class="regex-card-label">Minimized DFA</div>
          <div class="regex-card-formula" id="regex-min">${minRegex}</div>
          <div class="regex-card-note">${Object.keys(this.minDfa.states).length} states (minimized)</div>
        </div>
      </div>
    `;
    p.style.display = 'block';
  }

  updateStepLog(steps) {
    const container = document.getElementById('step-log');
    container.innerHTML = '';
    if (!steps || steps.length === 0) {
      container.innerHTML = '<div class="step-empty">Run conversion to see steps</div>'; return;
    }
    steps.forEach((step, i) => {
      const div = document.createElement('div');
      div.className = `step-item step-${step.type}`;
      div.innerHTML = `<span class="step-num">${i + 1}</span><span class="step-desc">${step.description}</span>`;
      container.appendChild(div);
    });
  }

  renderDFATable(dfa) {
    const container = document.getElementById('dfa-table-container');
    const stateList = Object.keys(dfa.states);
    let html = '<div class="table-label">Standard DFA</div><table class="dfa-result-table"><thead><tr><th>DFA State</th><th>NFA States</th>';
    dfa.alphabet.forEach(a => { html += `<th>${a}</th>`; });
    html += '</tr></thead><tbody>';
    stateList.forEach(state => {
      const isAccept = dfa.acceptStates.includes(state), isStart = state === dfa.startState;
      html += `<tr class="${isAccept ? 'accept-row' : ''} ${isStart ? 'start-row' : ''}">`;
      html += `<td class="dfa-state-cell">${isStart ? '→' : ''}${isAccept ? '*' : ''}${state}</td>`;
      html += `<td class="nfa-states-cell">{${(dfa.states[state] || []).join(', ')}}</td>`;
      dfa.alphabet.forEach(a => {
        const target = dfa.transitions[state] ? dfa.transitions[state][a] || '∅' : '∅';
        html += `<td>${target}</td>`;
      });
      html += '</tr>';
    });
    html += '</tbody></table>';
    container.innerHTML = html;
  }

  renderMinDFATable(dfa) {
    const container = document.getElementById('min-dfa-table-container');
    if (!container) return;
    const stateList = Object.keys(dfa.states);
    let html = '<div class="table-label table-label-min">Minimized DFA</div><table class="dfa-result-table min-table"><thead><tr><th>Min State</th><th>Orig States</th>';
    dfa.alphabet.forEach(a => { html += `<th>${a}</th>`; });
    html += '</tr></thead><tbody>';
    stateList.forEach(state => {
      const isAccept = dfa.acceptStates.includes(state), isStart = state === dfa.startState;
      html += `<tr class="${isAccept ? 'accept-row' : ''} ${isStart ? 'start-row' : ''}">`;
      html += `<td class="dfa-state-cell">${isStart ? '→' : ''}${isAccept ? '*' : ''}${state}</td>`;
      const orig = Array.isArray(dfa.states[state]) ? dfa.states[state].join(', ') : state;
      html += `<td class="nfa-states-cell">${orig}</td>`;
      dfa.alphabet.forEach(a => {
        const target = dfa.transitions[state] ? dfa.transitions[state][a] || '∅' : '∅';
        html += `<td>${target}</td>`;
      });
      html += '</tr>';
    });
    html += '</tbody></table>';
    container.innerHTML = html;
  }

  simulateString() {
    const input = document.getElementById('sim-input').value.trim();
    const resultDiv = document.getElementById('sim-result');
    const traceDiv = document.getElementById('sim-trace');

    if (!this.startState) { this.showToast('Define and convert NFA first.', 'error'); return; }

    const result = this.engine.simulateNFA(input);
    resultDiv.innerHTML = result.accepted
      ? `<span class="accepted">✓ ACCEPTED</span>`
      : `<span class="rejected">✗ REJECTED</span>`;

    let traceHtml = '<div class="trace-steps">';
    result.trace.forEach(t => {
      traceHtml += `<div class="trace-step">`;
      if (t.symbol) traceHtml += `<span class="trace-sym">─[${t.symbol}]→</span>`;
      else traceHtml += `<span class="trace-start">Start</span>`;
      traceHtml += `<span class="trace-states">{${t.states.join(', ') || '∅'}}</span>`;
      traceHtml += `</div>`;
    });
    traceHtml += '</div>';
    traceDiv.innerHTML = traceHtml;
  }

  loadExample() {
    document.getElementById('input-states').value = 'q0,q1,q2';
    document.getElementById('input-alphabet').value = '0,1';
    document.getElementById('input-start').value = 'q0';
    document.getElementById('input-accept').value = 'q2';
    this.parseInputs();
    this.rebuildTransitionTable();

    const exampleTrans = {
      'q0': { '0': 'q0,q1', '1': 'q0', 'ε': '' },
      'q1': { '0': '', '1': 'q2', 'ε': 'q2' },
      'q2': { '0': 'q2', '1': 'q2', 'ε': '' }
    };
    document.querySelectorAll('.trans-input').forEach(input => {
      const state = input.dataset.state, sym = input.dataset.symbol;
      if (exampleTrans[state] && exampleTrans[state][sym] !== undefined) input.value = exampleTrans[state][sym];
    });
    this.collectTransitions();
    this.showToast('Example loaded!', 'success');
  }

  clearAll() {
    document.getElementById('input-states').value = '';
    document.getElementById('input-alphabet').value = '';
    document.getElementById('input-start').value = '';
    document.getElementById('input-accept').value = '';
    document.getElementById('transition-tbody').innerHTML = '';
    document.getElementById('transition-thead').innerHTML = '<tr><th>State</th></tr>';
    document.getElementById('step-log').innerHTML = '<div class="step-empty">Run conversion to see steps</div>';
    document.getElementById('dfa-table-container').innerHTML = '';
    const minC = document.getElementById('min-dfa-table-container');
    if (minC) minC.innerHTML = '';
    document.getElementById('sim-result').innerHTML = '';
    document.getElementById('sim-trace').innerHTML = '';
    const ep = document.getElementById('live-explanation');
    if (ep) { ep.innerHTML = '<div class="exp-placeholder"><div class="exp-placeholder-icon">◈</div><div>Run a conversion to see live explanations here</div></div>'; ep.classList.remove('exp-visible'); }
    const mp = document.getElementById('min-explanation');
    if (mp) { mp.innerHTML = '<div class="exp-placeholder"><div class="exp-placeholder-icon">◈</div><div>Run a conversion to see minimization steps here</div></div>'; mp.classList.remove('exp-visible'); }
    const rp = document.getElementById('regex-panel');
    if (rp) { rp.style.display = 'none'; rp.innerHTML = ''; }
    this.renderer.init('standard');
    this.renderer.initMin('minimized');
    this.transitions = {};
    this.dfa = null;
    this.minDfa = null;
    this._explanationHistory = [];
    this.showToast('Cleared!', 'success');
  }

  showToast(msg, type) {
    const toast = document.getElementById('toast');
    toast.textContent = msg;
    toast.className = `toast show ${type}`;
    setTimeout(() => toast.classList.remove('show'), 2500);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const app = new App();
  app.init();
  window._app = app;
});

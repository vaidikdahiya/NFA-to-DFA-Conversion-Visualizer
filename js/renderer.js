// Renderer - Graph visualization (Enhanced with MinDFA + callbacks)
class AutomataRenderer {
  constructor() {
    this.nfaSvg = null; this.dfaSvg = null; this.minSvg = null;
    this.nfaZoom = null; this.dfaZoom = null; this.minZoom = null;
    this.nfaG = null; this.dfaG = null; this.minG = null;
  }

  init() { this.setupSVG('nfa-graph', 'nfa'); this.setupSVG('dfa-graph', 'dfa'); }
  initMin() { this.setupSVG('min-dfa-graph', 'min'); }

  setupSVG(containerId, type) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = '';
    const svg = d3.select('#' + containerId).append('svg').attr('width', '100%').attr('height', '100%').style('cursor', 'grab');
    const defs = svg.append('defs');
    ['normal', 'dead'].forEach(variant => {
      const color = variant === 'dead' ? '#ff5252' : (type === 'min' ? '#c084fc' : '#64ffda');
      defs.append('marker').attr('id', 'arrow-' + variant + '-' + type)
        .attr('viewBox', '0 -5 10 10').attr('refX', 22).attr('refY', 0)
        .attr('markerWidth', 6).attr('markerHeight', 6).attr('orient', 'auto')
        .append('path').attr('d', 'M0,-5L10,0L0,5').attr('fill', color);
    });
    const zoomBehavior = d3.zoom().scaleExtent([0.2, 5]).on('zoom', (event) => { g.attr('transform', event.transform); });
    svg.call(zoomBehavior).on('dblclick.zoom', null);
    svg.on('mousedown', () => svg.style('cursor', 'grabbing')).on('mouseup', () => svg.style('cursor', 'grab'));
    const g = svg.append('g').attr('class', 'graph-root');
    if (type === 'nfa') { this.nfaSvg = svg; this.nfaZoom = zoomBehavior; this.nfaG = g; }
    else if (type === 'dfa') { this.dfaSvg = svg; this.dfaZoom = zoomBehavior; this.dfaG = g; }
    else if (type === 'min') { this.minSvg = svg; this.minZoom = zoomBehavior; this.minG = g; }
    this._addZoomControls(containerId, svg, zoomBehavior, g, type);
  }

  _addZoomControls(containerId, svg, zoomBehavior, g, type) {
    const container = document.getElementById(containerId);
    if (!container) return;
    const ctrl = document.createElement('div');
    ctrl.className = 'zoom-controls';
    ctrl.innerHTML = '<button class="zoom-btn" data-action="in">+</button><button class="zoom-btn" data-action="reset">⊙</button><button class="zoom-btn" data-action="out">−</button><button class="zoom-btn" data-action="fit">⤢</button>';
    container.appendChild(ctrl);
    ctrl.querySelectorAll('.zoom-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const a = btn.dataset.action;
        if (a === 'in') svg.transition().duration(300).call(zoomBehavior.scaleBy, 1.5);
        else if (a === 'out') svg.transition().duration(300).call(zoomBehavior.scaleBy, 0.67);
        else if (a === 'reset') svg.transition().duration(400).call(zoomBehavior.transform, d3.zoomIdentity);
        else if (a === 'fit') this._fitToScreen(svg, zoomBehavior, g);
      });
    });
  }

  _fitToScreen(svg, zoomBehavior, g) {
    try {
      const bounds = g.node().getBBox();
      if (!bounds || bounds.width === 0) return;
      const n = svg.node(), W = n.clientWidth || 600, H = n.clientHeight || 400;
      const scale = Math.min(0.82 * W / bounds.width, 0.82 * H / bounds.height, 2.5);
      const tx = W / 2 - scale * (bounds.x + bounds.width / 2);
      const ty = H / 2 - scale * (bounds.y + bounds.height / 2);
      svg.transition().duration(500).call(zoomBehavior.transform, d3.zoomIdentity.translate(tx, ty).scale(scale));
    } catch(e) {}
  }

  computeLayout(states, transitions, alphabet, startState) {
    const stateList = Object.keys(states), n = stateList.length;
    if (n === 0) return {};
    const W = 600, H = 380, cx = W / 2, cy = H / 2;
    const r = Math.min(cx * 0.82, cy * 0.82) + Math.max(0, (n - 4) * 14);
    const positions = {};
    if (n === 1) { positions[stateList[0]] = { x: cx, y: cy }; return positions; }
    const startIdx = Math.max(0, stateList.indexOf(startState));
    stateList.forEach((s, i) => {
      const angle = (2 * Math.PI * ((i - startIdx + n) % n) / n) - Math.PI;
      positions[s] = { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) };
    });
    for (let iter = 0; iter < 50; iter++) {
      for (let i = 0; i < stateList.length; i++) {
        for (let j = i + 1; j < stateList.length; j++) {
          const pa = positions[stateList[i]], pb = positions[stateList[j]];
          const dx = pb.x - pa.x, dy = pb.y - pa.y, dist = Math.sqrt(dx * dx + dy * dy) || 1;
          if (dist < 110) {
            const push = (110 - dist) / 2 * 0.25, nx = dx / dist, ny = dy / dist;
            pa.x -= nx * push; pa.y -= ny * push; pb.x += nx * push; pb.y += ny * push;
          }
        }
      }
    }
    return positions;
  }

  renderNFA(nfa) {
    const svg = this.nfaSvg, g = this.nfaG;
    if (!svg || !g) return;
    g.selectAll('*').remove();
    const states = {}; nfa.states.forEach(s => states[s] = []);
    const positions = this.computeLayout(states, nfa.transitions, nfa.alphabet, nfa.startState);
    this.drawGraph(g, 'nfa', states, nfa.transitions, nfa.alphabet, nfa.startState, nfa.acceptStates, positions, true, false);
    setTimeout(() => this._fitToScreen(svg, this.nfaZoom, g), 150);
  }

  renderDFA(dfa, animate, steps, onStep, onComplete) {
    const svg = this.dfaSvg, g = this.dfaG;
    if (!svg || !g) return;
    g.selectAll('*').remove();
    const positions = this.computeLayout(dfa.states, dfa.transitions, dfa.alphabet, dfa.startState);
    if (animate && steps) this.animateDFABuild(svg, g, dfa, positions, steps, 'dfa', onStep, onComplete);
    else {
      this.drawGraph(g, 'dfa', dfa.states, dfa.transitions, dfa.alphabet, dfa.startState, dfa.acceptStates, positions, false, false);
      setTimeout(() => this._fitToScreen(svg, this.dfaZoom, g), 150);
      if (onComplete) onComplete();
    }
  }

  renderMinDFA(dfa) {
    const svg = this.minSvg, g = this.minG;
    if (!svg || !g) return;
    g.selectAll('*').remove();
    const positions = this.computeLayout(dfa.states, dfa.transitions, dfa.alphabet, dfa.startState);
    this.drawGraph(g, 'min', dfa.states, dfa.transitions, dfa.alphabet, dfa.startState, dfa.acceptStates, positions, false, true);
    setTimeout(() => this._fitToScreen(svg, this.minZoom, g), 150);
  }

  drawGraph(g, type, states, transitions, alphabet, startState, acceptStates, positions, isNFA, isMin) {
    const accent = isMin ? '#c084fc' : '#64ffda';
    const stateList = Object.keys(states);
    stateList.forEach(from => {
      if (!transitions[from]) return;
      const labelMap = {};
      alphabet.forEach(sym => {
        const targets = isNFA ? (Array.isArray(transitions[from][sym]) ? transitions[from][sym] : []) : (transitions[from][sym] ? [transitions[from][sym]] : []);
        targets.forEach(to => { const k = from + '->' + to; if (!labelMap[k]) labelMap[k] = []; labelMap[k].push(sym); });
      });
      if (isNFA && transitions[from]['ε']) {
        transitions[from]['ε'].forEach(to => { const k = from + '->' + to; if (!labelMap[k]) labelMap[k] = []; labelMap[k].push('ε'); });
      }
      Object.entries(labelMap).forEach(([key, syms]) => {
        const [f, t] = key.split('->');
        this.drawEdge(g, type, f, t, syms.join(','), positions, f === t, stateList, accent);
      });
    });
    stateList.forEach(s => this.drawNode(g, type, s, positions[s], s === startState, acceptStates.includes(s), s === '∅', accent));
    if (positions[startState]) {
      const pos = positions[startState];
      g.append('line').attr('x1', pos.x - 65).attr('y1', pos.y).attr('x2', pos.x - 31).attr('y2', pos.y)
        .attr('stroke', accent).attr('stroke-width', 2.5).attr('marker-end', 'url(#arrow-normal-' + type + ')');
    }
  }

  drawNode(g, type, label, pos, isStart, isAccept, isDead, accent) {
    if (!pos) return;
    const group = g.append('g').attr('class', 'state-node').attr('transform', 'translate(' + pos.x + ',' + pos.y + ')');
    const r = 28;
    const strokeColor = isDead ? '#ff5252' : isAccept ? '#ffd700' : accent;
    if (isAccept || isStart) {
      group.append('circle').attr('r', r + 9).attr('fill', isAccept ? 'rgba(255,215,0,0.07)' : 'rgba(100,255,218,0.06)').attr('stroke', 'none');
    }
    group.append('circle').attr('r', r).attr('fill', isDead ? '#1a0a0a' : isAccept ? '#0d2137' : '#0a192f')
      .attr('stroke', strokeColor).attr('stroke-width', isAccept ? 3 : 2).attr('class', 'node-circle');
    if (isAccept) group.append('circle').attr('r', r - 5).attr('fill', 'none').attr('stroke', '#ffd700').attr('stroke-width', 1.5).attr('opacity', 0.7);
    const fs = label.length > 9 ? '8px' : label.length > 6 ? '9px' : label.length > 3 ? '10px' : '12px';
    group.append('text').attr('text-anchor', 'middle').attr('dy', '0.35em')
      .attr('fill', isDead ? '#ff5252' : isAccept ? '#ffd700' : '#ccd6f6')
      .attr('font-size', fs).attr('font-family', 'JetBrains Mono, monospace').attr('font-weight', '600').text(label);
  }

  drawEdge(g, type, from, to, label, positions, isSelf, stateList, accent) {
    const p1 = positions[from], p2 = positions[to];
    if (!p1 || !p2) return;
    const isDead = to === '∅' || from === '∅';
    const color = isDead ? '#ff5252' : accent;
    const markerId = isDead ? 'url(#arrow-dead-' + type + ')' : 'url(#arrow-normal-' + type + ')';
    const r = 28;
    if (isSelf) {
      const lr = 22;
      g.append('path').attr('d', 'M' + (p1.x - lr) + ',' + (p1.y - r) + ' C' + (p1.x - lr * 3.5) + ',' + (p1.y - 90) + ' ' + (p1.x + lr * 3.5) + ',' + (p1.y - 90) + ' ' + (p1.x + lr) + ',' + (p1.y - r))
        .attr('fill', 'none').attr('stroke', color).attr('stroke-width', 1.8).attr('marker-end', markerId);
      g.append('text').attr('x', p1.x).attr('y', p1.y - 93).attr('text-anchor', 'middle')
        .attr('fill', color).attr('font-size', '12px').attr('font-family', 'JetBrains Mono, monospace').attr('font-weight', '600').text(label);
      return;
    }
    const dx = p2.x - p1.x, dy = p2.y - p1.y, dist = Math.sqrt(dx * dx + dy * dy) || 1;
    const mx = (p1.x + p2.x) / 2 + (-dy / dist) * 18, my = (p1.y + p2.y) / 2 + (dx / dist) * 18;
    const ux = dx / dist, uy = dy / dist;
    const x1 = p1.x + ux * (r + 2), y1 = p1.y + uy * (r + 2), x2 = p2.x - ux * (r + 2), y2 = p2.y - uy * (r + 2);
    g.append('path').attr('d', 'M' + x1 + ',' + y1 + ' Q' + mx + ',' + my + ' ' + x2 + ',' + y2)
      .attr('fill', 'none').attr('stroke', color).attr('stroke-width', 1.8).attr('marker-end', markerId).attr('opacity', 0.9);
    const lw = label.length * 7 + 10;
    g.append('rect').attr('x', mx - lw / 2).attr('y', my - 17).attr('width', lw).attr('height', 16).attr('rx', 4).attr('fill', '#020c18').attr('opacity', 0.75);
    g.append('text').attr('x', mx).attr('y', my - 7).attr('text-anchor', 'middle')
      .attr('fill', color).attr('font-size', '12px').attr('font-family', 'JetBrains Mono, monospace').attr('font-weight', '600').text(label);
  }

  animateDFABuild(svg, g, dfa, positions, steps, type, onStep, onComplete) {
    const drawnNodes = new Set(), drawnEdges = new Set();
    const STEP = 420, NODE_DUR = 420, EDGE_DUR = 360;
    let delay = 0;
    const accent = type === 'min' ? '#c084fc' : '#64ffda';

    const addNode = (stateKey, extra = 0) => {
      if (drawnNodes.has(stateKey)) return;
      drawnNodes.add(stateKey);
      const pos = positions[stateKey]; if (!pos) return;
      const isAccept = dfa.acceptStates.includes(stateKey), isDead = stateKey === '∅', isStart = stateKey === dfa.startState;
      const r = 28;
      setTimeout(() => {
        const group = g.append('g').attr('class', 'state-node').attr('transform', 'translate(' + pos.x + ',' + pos.y + ')').attr('opacity', 0);
        const strokeColor = isDead ? '#ff5252' : isAccept ? '#ffd700' : accent;
        if (isAccept || isStart) group.append('circle').attr('r', r + 9).attr('fill', isAccept ? 'rgba(255,215,0,0.07)' : 'rgba(100,255,218,0.06)').attr('stroke', 'none');
        group.append('circle').attr('r', 0).attr('fill', isDead ? '#1a0a0a' : isAccept ? '#0d2137' : '#0a192f')
          .attr('stroke', strokeColor).attr('stroke-width', isAccept ? 3 : 2).attr('class', 'node-circle')
          .transition().duration(NODE_DUR).ease(d3.easeBackOut.overshoot(1.3)).attr('r', r);
        if (isAccept) group.append('circle').attr('r', 0).attr('fill', 'none').attr('stroke', '#ffd700').attr('stroke-width', 1.5).attr('opacity', 0.7)
          .transition().duration(NODE_DUR).ease(d3.easeBackOut).attr('r', r - 5);
        const fs = stateKey.length > 9 ? '8px' : stateKey.length > 6 ? '9px' : stateKey.length > 3 ? '10px' : '12px';
        group.append('text').attr('text-anchor', 'middle').attr('dy', '0.35em')
          .attr('fill', isDead ? '#ff5252' : isAccept ? '#ffd700' : '#ccd6f6')
          .attr('font-size', fs).attr('font-family', 'JetBrains Mono, monospace').attr('font-weight', '600')
          .attr('opacity', 0).text(stateKey).transition().delay(200).duration(200).attr('opacity', 1);
        group.transition().duration(NODE_DUR).attr('opacity', 1);
        if (isStart && !drawnEdges.has('__start__')) {
          drawnEdges.add('__start__');
          g.append('line').attr('x1', pos.x - 65).attr('y1', pos.y).attr('x2', pos.x - 31).attr('y2', pos.y)
            .attr('stroke', accent).attr('stroke-width', 2.5).attr('marker-end', 'url(#arrow-normal-' + type + ')')
            .attr('opacity', 0).transition().duration(400).attr('opacity', 1);
        }
      }, delay + extra);
    };

    const addEdge = (from, to, label) => {
      const edgeKey = from + '->' + to + ':' + label;
      if (drawnEdges.has(edgeKey)) return;
      drawnEdges.add(edgeKey);
      setTimeout(() => {
        const p1 = positions[from], p2 = positions[to]; if (!p1 || !p2) return;
        const isSelf = from === to, isDead = to === '∅' || from === '∅';
        const color = isDead ? '#ff5252' : accent;
        const markerId = isDead ? 'url(#arrow-dead-' + type + ')' : 'url(#arrow-normal-' + type + ')';
        const r = 28;
        if (isSelf) {
          const lr = 22;
          g.append('path').attr('d', 'M' + (p1.x - lr) + ',' + (p1.y - r) + ' C' + (p1.x - lr * 3.5) + ',' + (p1.y - 90) + ' ' + (p1.x + lr * 3.5) + ',' + (p1.y - 90) + ' ' + (p1.x + lr) + ',' + (p1.y - r))
            .attr('fill', 'none').attr('stroke', color).attr('stroke-width', 1.8).attr('marker-end', markerId).attr('opacity', 0)
            .transition().duration(EDGE_DUR).attr('opacity', 1);
          g.append('text').attr('x', p1.x).attr('y', p1.y - 93).attr('text-anchor', 'middle')
            .attr('fill', color).attr('font-size', '12px').attr('font-family', 'JetBrains Mono, monospace').attr('font-weight', '600')
            .attr('opacity', 0).text(label).transition().delay(200).duration(200).attr('opacity', 1);
          return;
        }
        const dx = p2.x - p1.x, dy = p2.y - p1.y, dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const mx = (p1.x + p2.x) / 2 + (-dy / dist) * 18, my = (p1.y + p2.y) / 2 + (dx / dist) * 18;
        const ux = dx / dist, uy = dy / dist;
        const x1 = p1.x + ux * (r + 2), y1 = p1.y + uy * (r + 2), x2 = p2.x - ux * (r + 2), y2 = p2.y - uy * (r + 2);
        const pathEl = g.append('path').attr('d', 'M' + x1 + ',' + y1 + ' Q' + mx + ',' + my + ' ' + x2 + ',' + y2)
          .attr('fill', 'none').attr('stroke', color).attr('stroke-width', 1.8).attr('marker-end', markerId).attr('opacity', 0.9);
        try {
          const tl = pathEl.node().getTotalLength();
          pathEl.attr('stroke-dasharray', tl).attr('stroke-dashoffset', tl)
            .transition().duration(EDGE_DUR).ease(d3.easeCubicOut).attr('stroke-dashoffset', 0)
            .on('end', () => pathEl.attr('stroke-dasharray', null).attr('stroke-dashoffset', null));
        } catch(e) { pathEl.attr('opacity', 0).transition().duration(EDGE_DUR).attr('opacity', 0.9); }
        const lw = label.length * 7 + 10;
        g.append('rect').attr('x', mx - lw / 2).attr('y', my - 17).attr('width', lw).attr('height', 16).attr('rx', 4).attr('fill', '#020c18').attr('opacity', 0).transition().delay(200).duration(200).attr('opacity', 0.75);
        g.append('text').attr('x', mx).attr('y', my - 7).attr('text-anchor', 'middle')
          .attr('fill', color).attr('font-size', '12px').attr('font-family', 'JetBrains Mono, monospace').attr('font-weight', '600')
          .attr('opacity', 0).text(label).transition().delay(250).duration(200).attr('opacity', 1);
      }, delay);
    };

    const total = steps.length;
    steps.forEach((step, stepIdx) => {
      const capturedDelay = delay, capturedStep = step;
      setTimeout(() => { if (onStep) onStep(capturedStep, stepIdx, total); }, capturedDelay);
      if (step.type === 'start' || step.type === 'new_state') { addNode(step.dfaState); delay += STEP; }
      else if (step.type === 'transition') {
        addNode(step.fromDFA); addNode(step.toDFA, 150);
        const cf = step.fromDFA, ct = step.toDFA, cd = delay;
        setTimeout(() => {
          const lm = {};
          Object.entries(dfa.transitions[cf] || {}).forEach(([sym, to]) => { if (to === ct) { if (!lm[ct]) lm[ct] = []; lm[ct].push(sym); } });
          addEdge(cf, ct, lm[ct] ? lm[ct].join(',') : step.symbol);
        }, cd + 260);
        delay += STEP + 80;
      } else if (step.type === 'dead_state') { addNode('∅'); delay += STEP; }
    });

    setTimeout(() => {
      Object.entries(dfa.transitions).forEach(([from, trans]) => {
        const lm = {};
        Object.entries(trans).forEach(([sym, to]) => { if (!lm[to]) lm[to] = []; lm[to].push(sym); });
        Object.entries(lm).forEach(([to, syms]) => addEdge(from, to, syms.join(',')));
      });
      Object.keys(dfa.states).forEach(s => addNode(s));
      setTimeout(() => this._fitToScreen(svg, this.dfaZoom, g), 700);
      if (onComplete) setTimeout(onComplete, 800);
    }, delay + 400);
  }
}

window.AutomataRenderer = AutomataRenderer;

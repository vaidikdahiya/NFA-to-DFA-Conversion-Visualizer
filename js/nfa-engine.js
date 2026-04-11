// NFA Engine - Subset Construction + Minimization + Regex
class NFAEngine {
  constructor() {
    this.states = [];
    this.alphabet = [];
    this.startState = '';
    this.acceptStates = [];
    this.transitions = {};
  }

  setNFA(states, alphabet, startState, acceptStates, transitions) {
    this.states = states;
    this.alphabet = alphabet.filter(a => a !== 'ε');
    this.startState = startState;
    this.acceptStates = acceptStates;
    this.transitions = transitions;
  }

  getTransitions(state, symbol) {
    if (this.transitions[state] && this.transitions[state][symbol]) {
      return this.transitions[state][symbol];
    }
    return [];
  }

  epsilonClosure(states) {
    const closure = new Set(states);
    const stack = [...states];
    while (stack.length > 0) {
      const s = stack.pop();
      const epsTrans = this.getTransitions(s, 'ε');
      for (const ns of epsTrans) {
        if (!closure.has(ns)) { closure.add(ns); stack.push(ns); }
      }
    }
    return Array.from(closure).sort();
  }

  move(states, symbol) {
    const result = new Set();
    for (const s of states) {
      const trans = this.getTransitions(s, symbol);
      for (const ns of trans) result.add(ns);
    }
    return Array.from(result).sort();
  }

  convertToDFA() {
    const steps = [];
    const dfaStates = {};
    const dfaTransitions = {};
    const dfaAcceptStates = [];
    const queue = [];
    const visited = new Set();

    const startClosure = this.epsilonClosure([this.startState]);
    const startKey = this.stateSetKey(startClosure);
    dfaStates[startKey] = startClosure;
    queue.push(startClosure);
    visited.add(startKey);

    steps.push({ type: 'start', dfaState: startKey, nfaStates: startClosure,
      description: `Start: ε-closure({${this.startState}}) = {${startClosure.join(', ')}}` });

    if (startClosure.some(s => this.acceptStates.includes(s))) dfaAcceptStates.push(startKey);

    while (queue.length > 0) {
      const current = queue.shift();
      const currentKey = this.stateSetKey(current);
      dfaTransitions[currentKey] = {};

      for (const symbol of this.alphabet) {
        const moved = this.move(current, symbol);
        const closure = this.epsilonClosure(moved);
        const closureKey = closure.length > 0 ? this.stateSetKey(closure) : '∅';
        dfaTransitions[currentKey][symbol] = closureKey;

        steps.push({ type: 'transition', fromDFA: currentKey, fromNFA: current, symbol,
          moved, closure, toDFA: closureKey,
          description: `δ({${current.join(',')}}, ${symbol}) = move+ε-closure = {${closure.join(', ') || '∅'}}` });

        if (closure.length > 0 && !visited.has(closureKey)) {
          visited.add(closureKey);
          dfaStates[closureKey] = closure;
          queue.push(closure);
          if (closure.some(s => this.acceptStates.includes(s))) dfaAcceptStates.push(closureKey);
          steps.push({ type: 'new_state', dfaState: closureKey, nfaStates: closure,
            description: `New DFA state discovered: {${closure.join(', ')}}` });
        }
        if (closure.length === 0 && !visited.has('∅')) {
          visited.add('∅');
          dfaStates['∅'] = [];
          steps.push({ type: 'dead_state', dfaState: '∅', description: `Dead state ∅ added` });
        }
      }
    }

    if (dfaStates['∅']) {
      dfaTransitions['∅'] = {};
      for (const symbol of this.alphabet) dfaTransitions['∅'][symbol] = '∅';
    }

    return { states: dfaStates, startState: startKey, acceptStates: dfaAcceptStates,
      transitions: dfaTransitions, steps, alphabet: this.alphabet };
  }

  // ── MINIMIZATION (Hopcroft's table-filling) ──
  minimizeDFA(dfa) {
    const stateList = Object.keys(dfa.states).filter(s => s !== '∅' || dfa.acceptStates.includes('∅'));
    // Remove unreachable states first
    const reachable = this._reachableStates(dfa);
    const states = stateList.filter(s => reachable.has(s));

    if (states.length === 0) return dfa;

    // Partition: accepting vs non-accepting
    const accepting = new Set(states.filter(s => dfa.acceptStates.includes(s)));
    const nonAccepting = new Set(states.filter(s => !dfa.acceptStates.includes(s)));

    let partitions = [];
    if (accepting.size > 0) partitions.push(accepting);
    if (nonAccepting.size > 0) partitions.push(nonAccepting);

    let changed = true;
    while (changed) {
      changed = false;
      const newPartitions = [];
      for (const group of partitions) {
        const split = this._splitGroup(group, partitions, dfa);
        if (split.length > 1) { changed = true; newPartitions.push(...split); }
        else newPartitions.push(group);
      }
      partitions = newPartitions;
    }

    // Build minimized DFA
    const stateToPartition = {};
    partitions.forEach((part, idx) => {
      part.forEach(s => { stateToPartition[s] = idx; });
    });

    const minStates = {};
    const minTransitions = {};
    const minAcceptStates = [];

    partitions.forEach((part, idx) => {
      const rep = Array.from(part)[0];
      const label = this._partitionLabel(part, idx);
      minStates[label] = Array.from(part);

      minTransitions[label] = {};
      for (const sym of dfa.alphabet) {
        const target = (dfa.transitions[rep] || {})[sym];
        if (target !== undefined) {
          const targetPart = stateToPartition[target];
          if (targetPart !== undefined) {
            const targetLabel = this._partitionLabel(partitions[targetPart], targetPart);
            minTransitions[label][sym] = targetLabel;
          }
        }
      }
      if (dfa.acceptStates.includes(rep)) minAcceptStates.push(label);
    });

    const startPartIdx = stateToPartition[dfa.startState];
    const minStartState = this._partitionLabel(partitions[startPartIdx], startPartIdx);

    return { states: minStates, startState: minStartState, acceptStates: minAcceptStates,
      transitions: minTransitions, alphabet: dfa.alphabet, isMinimized: true };
  }

  _reachableStates(dfa) {
    const reachable = new Set([dfa.startState]);
    const queue = [dfa.startState];
    while (queue.length > 0) {
      const s = queue.shift();
      for (const sym of dfa.alphabet) {
        const t = (dfa.transitions[s] || {})[sym];
        if (t && !reachable.has(t)) { reachable.add(t); queue.push(t); }
      }
    }
    return reachable;
  }

  _splitGroup(group, partitions, dfa) {
    const members = Array.from(group);
    if (members.length === 1) return [group];

    const groups = [new Set([members[0]])];
    for (let i = 1; i < members.length; i++) {
      const s = members[i];
      let placed = false;
      for (const g of groups) {
        const rep = Array.from(g)[0];
        if (this._samePartition(s, rep, partitions, dfa)) { g.add(s); placed = true; break; }
      }
      if (!placed) groups.push(new Set([s]));
    }
    return groups;
  }

  _samePartition(s1, s2, partitions, dfa) {
    for (const sym of dfa.alphabet) {
      const t1 = (dfa.transitions[s1] || {})[sym];
      const t2 = (dfa.transitions[s2] || {})[sym];
      const p1 = t1 !== undefined ? partitions.findIndex(p => p.has(t1)) : -1;
      const p2 = t2 !== undefined ? partitions.findIndex(p => p.has(t2)) : -1;
      if (p1 !== p2) return false;
    }
    return true;
  }

  _partitionLabel(part, idx) {
    if (part.size === 1) return Array.from(part)[0];
    return '{' + Array.from(part).sort().join(',') + '}';
  }

  // ── REGEX GENERATION (State Elimination) ──
  generateRegex(dfa) {
    try {
      const states = Object.keys(dfa.states);
      if (states.length === 0) return '∅';

      // Build GNFA transitions (generalized NFA with regex labels)
      const gnfa = {};
      const allStates = ['__start__', ...states, '__accept__'];

      allStates.forEach(s => { gnfa[s] = {}; allStates.forEach(t => { gnfa[s][t] = null; }); });

      // Add start → original start
      gnfa['__start__'][dfa.startState] = 'ε';

      // Add original transitions
      states.forEach(s => {
        for (const sym of dfa.alphabet) {
          const t = (dfa.transitions[s] || {})[sym];
          if (t && states.includes(t)) {
            if (gnfa[s][t] === null) gnfa[s][t] = sym;
            else gnfa[s][t] = this._regexUnion(gnfa[s][t], sym);
          }
        }
      });

      // Add accept state transitions
      dfa.acceptStates.forEach(s => { if (states.includes(s)) gnfa[s]['__accept__'] = 'ε'; });

      // Eliminate all internal states
      let internalStates = [...states];
      for (const elim of internalStates) {
        const self = gnfa[elim][elim];
        const selfStar = self ? this._regexStar(self) : 'ε';
        const preds = allStates.filter(s => s !== elim && gnfa[s][elim] !== null);
        const succs = allStates.filter(t => t !== elim && gnfa[elim][t] !== null);

        for (const pred of preds) {
          for (const succ of succs) {
            const r1 = gnfa[pred][elim];
            const r2 = gnfa[elim][succ];
            let newR = this._regexConcat(this._regexConcat(r1, selfStar), r2);
            if (gnfa[pred][succ] !== null) newR = this._regexUnion(gnfa[pred][succ], newR);
            gnfa[pred][succ] = newR;
          }
        }
        // Remove elim from all
        allStates.forEach(s => { gnfa[s][elim] = null; gnfa[elim][s] = null; });
      }

      const result = gnfa['__start__']['__accept__'];
      return result || '∅';
    } catch(e) {
      return '(error generating regex)';
    }
  }

  _regexUnion(r1, r2) {
    if (!r1 || r1 === '∅') return r2;
    if (!r2 || r2 === '∅') return r1;
    if (r1 === r2) return r1;
    // Normalize: put shorter one first
    const a = r1.length <= r2.length ? r1 : r2;
    const b = r1.length <= r2.length ? r2 : r1;
    return `(${a}|${b})`;
  }

  _regexConcat(r1, r2) {
    if (!r1 || r1 === '∅' || !r2 || r2 === '∅') return '∅';
    if (r1 === 'ε') return r2;
    if (r2 === 'ε') return r1;
    const left = /^[\w]$/.test(r1) ? r1 : `(${r1})`;
    const right = /^[\w]$/.test(r2) ? r2 : `(${r2})`;
    // avoid double parens
    const l2 = r1.length === 1 ? r1 : `(${r1})`;
    const r22 = r2.length === 1 ? r2 : `(${r2})`;
    return `${l2}${r22}`;
  }

  _regexStar(r) {
    if (!r || r === 'ε' || r === '∅') return 'ε';
    if (r.length === 1) return `${r}*`;
    return `(${r})*`;
  }

  stateSetKey(states) {
    if (states.length === 0) return '∅';
    return '{' + states.sort().join(',') + '}';
  }

  simulateNFA(input) {
    let current = new Set(this.epsilonClosure([this.startState]));
    const trace = [{ states: Array.from(current), symbol: null, step: 0 }];
    for (let i = 0; i < input.length; i++) {
      const symbol = input[i];
      const moved = this.move(Array.from(current), symbol);
      const nextStates = new Set(this.epsilonClosure(moved));
      trace.push({ states: Array.from(nextStates), symbol, step: i + 1 });
      current = nextStates;
    }
    const accepted = Array.from(current).some(s => this.acceptStates.includes(s));
    return { accepted, trace };
  }
}

window.NFAEngine = NFAEngine;

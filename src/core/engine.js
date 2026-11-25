// The engine: one reader per turn, one shared ledger, one note. It talks to the outside only through `host`,
// so the same code runs inside the chat application and in plain node tests.
//
// host = {
//   chat(): message[]                      current chat
//   store(create?): object|null            this chat's saved data  { v, ev: { fingerprint: record }, apps: { id: {} } }
//   cfg(): object                          saved settings          { apps: { id: { on, cfg } }, ... }
//   saveChat(), saveCfg()
//   names(): { user, char }
//   classify(prompt): Promise<string>      the ONLY model call the engine ever makes
//   gen?(): string                         kind of generation being prepared (optional)
//   put(slot, text)                        slot = 'state' | 'now'; '' removes it
//   changed()                              something visible changed (redraw)
// }
import { Registry } from './registry.js';
import { buildClassifierPrompt, askedKeys, turnText } from './prompt.js';
import { parseAnswer, brokenKind, validate } from './parse.js';
import { fold, pending, prune, unread } from './ledger.js';
import { compose } from './note.js';
import { meter } from './meter.js';
import { cleanText, fingerprint, isReply, isUserTurn } from './text.js';

export const STORE_V = 1;
// Lines the reader wrote that were not kept, kept beside the record for the "how it was judged" view (small: 6 at most).
const dropNote = (dropped) => dropped.slice(0, 6).map((d) => [String(d.raw ?? '').slice(0, 80), d.why]);
const MAX_TRIES = 2;
const sigOf = (reg, states, envOf, turn = null) => askedKeys(reg, states, envOf, turn).map((k) => k.id).sort().join(',');

export class Engine {
    constructor(host) {
        this.host = host;
        this.reg = new Registry();
        this.rev = 0;                 // bumped on every change; the ledger is re-folded only when it moved
        this.cache = { rev: -1, key: '', S: {} };
        this.lastPut = { state: '', now: '' };
        this.busy = false;
        this.folding = false;
        this.stats = { calls: 0, kept: 0, dropped: 0, lastPrompt: '', lastAnswer: '', lastDropped: [], status: '' };
    }

    // ── apps ──
    add(def) { const why = this.reg.add(def); if (!why) this.touch(); return why; }
    remove(id) { const ok = this.reg.remove(id); if (ok) this.touch(); return ok; }
    touch() { this.rev++; }

    // What an app sees: its own saved data and a few read-only facts. Never another app's data.
    envOf = (id) => {
        const h = this.host, st = h.store(false), cfg = h.cfg();
        const chat = h.chat();
        const last = this.lastReply();
        return {
            store: st ? ((st.apps ??= {})[id] ??= {}) : {},
            cfg: ((cfg.apps ??= {})[id] ??= {}).cfg ??= {},
            // this app's saved data for the character (or group) on screen: follows them into every chat
            card: (() => { const key = h.cardKey?.(); return key ? (((cfg.cards ??= {})[key] ??= {})[id] ??= {}) : {}; })(),
            ...h.names(),
            last,
            // the kind of generation being prepared ('normal', 'swipe', 'regenerate', 'continue', … or '' when none)
            gen: h.gen?.() ?? '',
            // is the newest message the person's own (a reply to it is about to be written)?
            pending: chat.length > 0 && isUserTurn(chat.at(-1)),
            recent: (n = 3) => chat.filter(isReply).slice(-n).map((m) => cleanText(m.mes)),
            lastUser: () => { const m = [...chat].reverse().find(isUserTurn); return m ? cleanText(m.mes) : ''; },
            // read-only copy of another app's ledger state (null when that app is off, or while the ledger is being rebuilt)
            peek: (other) => (this.folding || other === id || !this.reg.has(other) ? null : this.state(other)),
            // read-only copy of another app's own saved data for this chat (null when that app is off)
            // a hand correction on the newest reply, as if the person had made it (same checks; gone if that reply is swiped away)
            fix: (k, v) => this.fix(k, v),
            peekStore: (other) => { if (other === id || !this.reg.has(other)) return null; try { return JSON.parse(JSON.stringify(st?.apps?.[other] ?? {})); } catch (e) { return null; } },
        };
    };

    // Index of the newest reply in the chat (-1 when there is none).
    lastReply() { const chat = this.host.chat(); for (let i = chat.length - 1; i >= 0; i--) if (isReply(chat[i])) return i; return -1; }

    // ── ledger ──
    states() {
        const chat = this.host.chat(), st = this.host.store(false);
        const key = `${chat.length}:${chat.length ? fingerprint(chat.at(-1)) : ''}`;
        if (this.cache.rev === this.rev && this.cache.key === key) return this.cache.S;
        let S = {};
        this.folding = true;
        try { S = fold({ chat, records: st?.ev ?? {}, fixes: st?.fix ?? {}, reg: this.reg, envOf: this.envOf }); } finally { this.folding = false; }
        this.cache = { rev: this.rev, key, S };
        return S;
    }
    state(id) { const s = this.states()[id]; return s == null ? null : structuredClone(s); }

    // A correction made by hand: one line in the same form the reader writes, attached to the newest reply.
    // It is counted after that reply's own lines, and disappears with the reply if it is swiped away or deleted.
    fix(k, v) {
        const i = this.lastReply(), app = this.reg.ownerOf(k);
        if (i < 0 || !app) return false;
        try { if (app.check && app.check({ k, v: String(v), q: '' }, { ...this.envOf(app.id), text: '' }) === false) return false; } catch (e) { return false; }
        const st = this.host.store(true), fp = fingerprint(this.host.chat()[i]);
        ((st.fix ??= {})[fp] ??= []).push([k, String(v)]);
        this.touch(); this.host.saveChat(); this.refresh(); this.host.changed();
        return true;
    }
    // Take back every hand-made correction on one reply.
    unfix(i) {
        const st = this.host.store(false), m = this.host.chat()[i];
        if (!st?.fix || !m) return;
        delete st.fix[fingerprint(m)];
        this.touch(); this.host.saveChat(); this.refresh(); this.host.changed();
    }
    // What was recorded for each reply still in the chat, oldest first: [{ i, fp, L, fixed, fail, D (dropped: [raw, why]), ks, src, cont }]
    log() {
        const st = this.host.store(false), out = [];
        this.host.chat().forEach((m, i) => {
            if (!isReply(m)) return;
            const fp = fingerprint(m), rec = st?.ev?.[fp];
            out.push({ i, fp, read: !!rec, L: rec?.L ?? [], fixed: st?.fix?.[fp] ?? [], fail: rec?.fail ?? '', D: rec?.D ?? [], ks: rec?.ks ?? '', src: rec?.src ?? '', cont: !!rec?.cont });
        });
        return out;
    }
    // Short labels for one reply's lines, written by the apps that own them (shown under the reply).
    chips(entry) {
        const out = [];
        for (const [k, v, q] of [...entry.L, ...entry.fixed]) {
            const app = this.reg.ownerOf(k);
            if (!app?.chip) continue;
            try { const c = app.chip({ k, v, q: q ?? '' }, this.envOf(app.id)); if (c) out.push({ app: app.id, text: String(c).slice(0, 40) }); } catch (e) { /* optional */ }
        }
        return out;
    }

    // ── token meter (what each app adds to the reader's prompt and to the note) ──
    meter() { return meter({ reg: this.reg, states: this.states(), envOf: this.envOf }); }

    // ── note ──
    note() { return this.reg.size ? compose({ reg: this.reg, states: this.states(), envOf: this.envOf }) : { state: '', now: '', by: {} }; }
    // Puts the note where the next reply will see it. A slot is touched only when its text really changed,
    // so with nothing to say the outgoing prompt is never touched at all.
    refresh() {
        let n = { state: '', now: '' };
        try { if (!this.paused()) n = this.note(); } catch (e) { console.warn('[meatball] note failed', e); }
        for (const slot of ['state', 'now']) {
            if (this.lastPut[slot] === n[slot]) continue;
            this.host.put(slot, n[slot]);
            this.lastPut[slot] = n[slot];
        }
        return n;
    }
    paused() { const st = this.host.store(false), c = this.host.cfg(); return !!c.paused || !!st?.off; }

    // ── reader ──
    // Reads the newest unread replies, one call each, at most `max`. Returns how many calls were made.
    async read({ max = 2, force = null } = {}) {
        if (this.busy || this.paused()) return 0;
        if (!this.reg.keys().length) { this.stats.status = 'no-keys'; return 0; }   // nobody asked for anything: no call
        const st = this.host.store(true);
        st.ev ??= {};
        const list = force ? [force] : pending({ chat: this.host.chat(), records: st.ev, max }).reverse();
        let calls = 0;
        this.busy = true;
        try {
            for (const job of list) {
                const upto = job.i;
                const states = fold({ chat: this.host.chat(), records: st.ev, fixes: st.fix ?? {}, reg: this.reg, envOf: this.envOf, upto });
                const turn = { text: turnText({ reply: job.reply, user: job.user }), at: job.i, read: Object.keys(st.ev).length, force: !!force };
                const prompt = buildClassifierPrompt({ reg: this.reg, states, envOf: this.envOf, reply: job.reply, user: job.user, turn });
                const ks = sigOf(this.reg, states, this.envOf, turn);   // the keys really asked this time (conditional ones only when due)
                if (!prompt) break;
                let answer = '';
                calls++; this.stats.calls++; this.stats.lastPrompt = prompt;
                let threw = false;
                try { answer = await this.host.classify(prompt); } catch (e) { answer = ''; threw = true; this.stats.status = `error: ${e?.message ?? e}`; }
                this.stats.lastAnswer = String(answer ?? '');
                if (this.host.store(false) !== st) break;                    // the chat was switched while waiting
                if (threw) break;                                            // the connection failed: the reply stays unread, the queue decides when to try again
                const cur = this.host.chat()[job.i];
                if (!cur || fingerprint(cur) !== job.fp) continue;           // the reply was swiped or edited meanwhile: its answer is stale
                const broken = brokenKind(answer);
                if (broken) {
                    // an unusable answer is tried once more on the next turn of the queue, then the reply is left unread
                    const tries = ((st.tries ??= {})[job.fp] = (st.tries[job.fp] ?? 0) + 1);
                    if ((tries >= MAX_TRIES || force) && !job.merge) { st.ev[job.fp] = { t: Date.now(), L: [], fail: broken }; delete st.tries[job.fp]; }
                    this.stats.status = `unusable answer (${broken})`;
                    continue;
                }
                const text = [job.user, job.reply].join('\n');
                const { kept, dropped } = validate(parseAnswer(answer), { reg: this.reg, text, reply: job.reply, envOf: this.envOf });
                // a reply that was extended ("continue"): the new lines join what was already recorded for its first part
                st.ev[job.fp] = { t: Date.now(), L: job.merge ? [...(st.ev[job.fp]?.L ?? []), ...kept] : kept, ks, ...(dropped.length ? { D: dropNote(dropped) } : {}) };
                this.stats.kept += kept.length; this.stats.dropped += dropped.length; this.stats.lastDropped = dropped.slice(0, 12);
                this.stats.status = 'ok';
            }
        } finally { this.busy = false; }
        if (calls) { prune(st.ev, this.host.chat(), 400, st); this.touch(); this.host.saveChat(); this.refresh(); this.host.changed(); }
        return calls;
    }
    // Read one reply again on request (the person saw it was read wrong).
    async reread(i) {
        const chat = this.host.chat(), m = chat[i];
        if (!isReply(m)) return 0;
        let user = '';
        for (let j = i - 1; j >= 0; j--) { if (isUserTurn(chat[j])) { user = chat[j].mes ?? ''; break; } if (isReply(chat[j])) break; }
        const st = this.host.store(true);
        delete (st.ev ??= {})[fingerprint(m)];
        return this.read({ force: { i, fp: fingerprint(m), reply: m.mes, user } });
    }

    // The newest reply was extended, not replaced: its record and hand-made corrections move to the longer text.
    // Only the added part is read, and only when it is long enough to matter. -> calls made (0 or 1)
    async continued(oldFp, oldLen, minAdded = 400) {
        const i = this.lastReply(), st = this.host.store(false), m = this.host.chat()[i];
        if (!st?.ev?.[oldFp] || !m) return 0;
        const fp = fingerprint(m);
        if (fp === oldFp || st.ev[fp]) return 0;
        st.ev[fp] = { ...st.ev[oldFp], t: Date.now(), cont: true };
        if (st.fix?.[oldFp]) { st.fix[fp] = st.fix[oldFp]; delete st.fix[oldFp]; }
        this.touch(); this.host.saveChat(); this.refresh(); this.host.changed();
        const added = String(m.mes ?? '').slice(oldLen);
        if (cleanText(added).length < minAdded || !this.reg.keys().length) return 0;
        return this.read({ force: { i, fp, reply: added, user: '', merge: true } });
    }

    // ── reading a whole chat on request ──
    // Is there anything to ask the reader right now? (conditional keys count only while their condition holds)
    asking() { try { return askedKeys(this.reg, this.states(), this.envOf).length > 0; } catch (e) { return this.reg.keys().length > 0; } }
    unreadCount() { return this.asking() ? unread({ chat: this.host.chat(), records: this.host.store(false)?.ev ?? {} }).length : 0; }
    // Reads every reply that has no record yet, oldest first, `batch` replies per call.
    // onStep({ done, total, calls }) after each call; ctl.stop = true ends it after the call in flight.
    // The newest run of replies that have no record yet (newest first), at most `max`.
    tail(max = 3) { return pending({ chat: this.host.chat(), records: this.host.store(false)?.ev ?? {}, max }); }
    // only (optional): a Set of reply fingerprints — read just those (used by «읽는 간격»: the newest few, together).
    async fill({ batch = 3, onStep = () => {}, ctl = {}, gap = 0, only = null, src = 'fill' } = {}) {
        if (this.busy || this.paused() || !this.reg.keys().length) return { done: 0, total: 0, calls: 0 };
        const st = this.host.store(true);
        st.ev ??= {};
        const all = unread({ chat: this.host.chat(), records: st.ev }).filter((j) => !only || only.has(j.fp));
        let done = 0, calls = 0;
        this.busy = true;
        try {
            for (let at = 0; at < all.length && !ctl.stop; at += batch) {
                const jobs = all.slice(at, at + batch).filter((j) => { const m = this.host.chat()[j.i]; return m && fingerprint(m) === j.fp; });
                if (!jobs.length) continue;
                const states = fold({ chat: this.host.chat(), records: st.ev, fixes: st.fix ?? {}, reg: this.reg, envOf: this.envOf, upto: jobs[0].i });
                const turn = { text: turnText({ jobs }), at: jobs[0].i, read: Object.keys(st.ev).length, force: false };
                const prompt = buildClassifierPrompt({ reg: this.reg, states, envOf: this.envOf, jobs, turn });
                const ks = sigOf(this.reg, states, this.envOf, turn);
                if (!prompt) break;
                let answer = '';
                calls++; this.stats.calls++; this.stats.lastPrompt = prompt;
                try { answer = await this.host.classify(prompt); } catch (e) { answer = ''; this.stats.status = `error: ${e?.message ?? e}`; }
                this.stats.lastAnswer = String(answer ?? '');
                if (this.host.store(false) !== st) break;                    // the chat was switched while waiting
                const broken = brokenKind(answer);
                const text = jobs.map((j) => `${j.user}\n${j.reply}`).join('\n');
                const { kept, dropped } = broken ? { kept: [], dropped: [] } : validate(parseAnswer(answer), { reg: this.reg, text, reply: jobs.map((j) => j.reply).join('\n'), envOf: this.envOf });
                for (const j of jobs) {
                    // a line without a number can only belong to a call that read one reply
                    const L = kept.filter((l) => (l.n == null ? jobs.length === 1 : l.n === j.i)).map((l) => [...l]);
                    const D = dropped.filter((d) => (d.n == null ? jobs.length === 1 : d.n === j.i));
                    st.ev[j.fp] = broken ? { t: Date.now(), L: [], fail: broken } : { t: Date.now(), L, ks, src, ...(D.length ? { D: dropNote(D) } : {}) };
                }
                this.stats.kept += kept.length; this.stats.dropped += dropped.length; this.stats.lastDropped = dropped.slice(0, 12);
                this.stats.status = broken ? `unusable answer (${broken})` : 'ok';
                done += jobs.length;
                this.touch(); this.host.saveChat();
                try { onStep({ done, total: all.length, calls }); } catch (e) { /* progress display is optional */ }
                if (gap) await new Promise((r) => setTimeout(r, gap));
            }
        } finally { this.busy = false; }
        this.touch(); this.refresh(); this.host.changed();
        return { done, total: all.length, calls };
    }
    // Records brought in from somewhere else (an earlier generation's data): never overwrite what is already here.
    adopt(records = {}, appData = {}) {
        const st = this.host.store(true);
        st.ev ??= {}; st.apps ??= {};
        let n = 0;
        for (const [fp, rec] of Object.entries(records)) if (!st.ev[fp] && Array.isArray(rec?.L)) { st.ev[fp] = rec; n++; }
        // values the person already set here win — but an empty one (an app screen opened once leaves [] or '') does not
        const empty = (v) => v == null || v === '' || (Array.isArray(v) && !v.length) || (typeof v === 'object' && !Array.isArray(v) && !Object.keys(v).length);
        for (const [id, data] of Object.entries(appData)) {
            const cur = st.apps[id] ?? {}, out = { ...data };
            for (const [k, v] of Object.entries(cur)) if (!empty(v) || !(k in data)) out[k] = v;
            st.apps[id] = out;
        }
        this.touch(); this.host.saveChat(); this.refresh(); this.host.changed();
        return n;
    }
    // A model call the person asked for by tapping (a text reply, a headline…). Never made on its own.
    async ask(prompt, max = 400) {
        if (this.paused()) return '';
        this.stats.taps = (this.stats.taps ?? 0) + 1;
        try { return String(await this.host.ask(prompt, max) ?? '').trim(); } catch (e) { this.stats.status = `error: ${e?.message ?? e}`; return ''; }
    }

    // A new reply arrived: one-time things are spent, then the note is rebuilt.
    onReply() {
        let dirty = false;
        for (const app of this.reg.list()) { try { if (app.onReply?.(this.envOf(app.id))) dirty = true; } catch (e) { /* optional hook */ } }
        if (dirty) this.host.saveChat();
        this.touch(); this.refresh();
    }
    // The chat on screen changed (switched, swiped, deleted, edited).
    onChat() { this.touch(); this.refresh(); this.host.changed(); }
    // Everything off: leave no trace in the prompt.
    clear() { for (const slot of ['state', 'now']) if (this.lastPut[slot]) { this.host.put(slot, ''); this.lastPut[slot] = ''; } }
}

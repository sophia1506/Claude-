// Tageseintrag als Bottom-Sheet. Jede Änderung wird sofort gespeichert.

import {
  state, getDay, saveDay, isPeriodDay, setPeriodDay, allSymptoms, addCustomSymptom,
} from '../store.js';
import { buildContext } from '../context.js';
import { PHASES } from '../cycle.js';
import { openSheet, scaleHTML, flowHTML, toast } from '../ui.js';
import { esc, fmtLong, relativeDay, todayISO, nowTime, uid, debounce, fmtNum } from '../util.js';

const MED_SUGGESTIONS = ['Ibuprofen', 'Paracetamol', 'Naproxen', 'Buscopan', 'Aspirin'];

export function openDayEntry(date) {
  const today = todayISO();
  let entry = structuredClone(getDay(date));
  let addingSymptom = false;

  const persist = async () => { entry = structuredClone(await saveDay(entry)); };
  const saveNote = debounce(() => saveDay(entry), 400);

  openSheet({
    title: fmtLong(date),
    className: 'sheet-entry',
    render(body, close) {
      function render() {
        const scroll = body.scrollTop;
        const ctx = buildContext(today);
        const ph = ctx.phaseOf(date);
        const pill = ctx.pillOf(date);
        const isPeriod = isPeriodDay(date, today);
        const future = date > today;
        const symptoms = allSymptoms();

        body.innerHTML = `
          <p class="entry-sub">
            <span class="muted">${esc(relativeDay(date, today))}</span>
            ${ph?.phase ? `<span class="phase-badge phase-${ph.phase}">${PHASES[ph.phase].label}${ph.estimated || ph.predictedPeriod ? ' (geschätzt)' : ''} · Tag ${ph.cycleDay}</span>` : ''}
          </p>

          <section class="entry-sec">
            <label class="switch-row">
              <span><strong>Periode</strong> an diesem Tag</span>
              <input type="checkbox" class="switch" data-act="period" ${isPeriod ? 'checked' : ''} ${future ? 'disabled' : ''}>
            </label>
            ${future ? '<p class="hint">Für zukünftige Tage kann keine Periode eingetragen werden.</p>' : ''}
            ${isPeriod ? `<p class="label">Stärke</p>${flowHTML(entry.flow)}` : ''}
            ${isPeriod && pill?.inPause ? '<p class="hint">In der Pillenpause ist das eine <strong>Abbruchblutung</strong>, keine natürliche Periode.</p>' : ''}
          </section>

          <section class="entry-sec">
            <h3>Symptome</h3>
            <div class="chip-row">
              ${symptoms.map((s) => `
                <button type="button" class="chip${entry.symptoms.includes(s.id) ? ' active' : ''}" aria-pressed="${entry.symptoms.includes(s.id)}" data-sym="${esc(s.id)}">${esc(s.label)}</button>`).join('')}
              ${addingSymptom ? '' : '<button type="button" class="chip chip-add" data-act="add-sym">＋ Eigenes</button>'}
            </div>
            ${addingSymptom ? `
              <form class="inline-form" data-form="sym">
                <input type="text" name="label" maxlength="30" placeholder="z. B. Rückenschmerzen" aria-label="Eigenes Symptom" autocomplete="off">
                <button type="submit" class="btn btn-small btn-primary">Hinzufügen</button>
              </form>` : ''}
          </section>

          <section class="entry-sec"><h3>Stimmung</h3>${scaleHTML('mood', entry.mood)}</section>
          <section class="entry-sec"><h3>Energie</h3>${scaleHTML('energy', entry.energy)}</section>
          <section class="entry-sec"><h3>Fokus &amp; Konzentration</h3>
            <p class="hint">Wie gut konntest du lernen oder dich konzentrieren?</p>
            ${scaleHTML('focus', entry.focus)}
          </section>

          <section class="entry-sec"><h3>Schlaf</h3>
            ${scaleHTML('sleepQuality', entry.sleepQuality)}
            <div class="stepper" aria-label="Schlafstunden">
              <span class="label">Stunden <span class="muted">(optional)</span></span>
              <div class="stepper-ctrl">
                <button type="button" class="icon-btn" data-act="sleep-minus" aria-label="Weniger">−</button>
                <button type="button" class="stepper-val" data-act="sleep-set">${entry.sleepHours == null ? '–' : `${fmtNum(entry.sleepHours)} h`}</button>
                <button type="button" class="icon-btn" data-act="sleep-plus" aria-label="Mehr">＋</button>
              </div>
            </div>
          </section>

          <section class="entry-sec"><h3>Schmerzmittel</h3>
            ${entry.meds.length ? `<ul class="med-list">${entry.meds.map((m) => `
              <li><span>💊 <strong>${esc(m.name)}</strong>${m.time ? ` <span class="muted">um ${esc(m.time)}</span>` : ''}</span>
              <button type="button" class="icon-btn" data-del-med="${esc(m.id)}" aria-label="${esc(m.name)} entfernen">✕</button></li>`).join('')}</ul>` : ''}
            <div class="chip-row">
              ${MED_SUGGESTIONS.slice(0, 4).map((m) => `<button type="button" class="chip" data-quick-med="${m}">＋ ${m}</button>`).join('')}
            </div>
            <form class="inline-form med-form" data-form="med">
              <input type="text" name="name" list="med-suggestions" maxlength="60" placeholder="Anderes Mittel" aria-label="Name des Mittels" autocomplete="off">
              <input type="time" name="time" value="${date === today ? nowTime() : ''}" aria-label="Uhrzeit">
              <button type="submit" class="btn btn-small btn-primary">＋</button>
            </form>
            <datalist id="med-suggestions">${MED_SUGGESTIONS.map((m) => `<option value="${m}">`).join('')}</datalist>
          </section>

          ${state.settings.pill.enabled ? `
          <section class="entry-sec"><h3>Pille</h3>
            ${pill && !pill.shouldTake
              ? `<p class="pill-pause">🌙 Pillenpause (Tag ${pill.dayInPack - pill.type.active} von ${pill.type.pack - pill.type.active}) – keine Einnahme nötig.</p>`
              : `<label class="switch-row"><span>💊 Pille genommen${pill?.placebo ? ' <span class="muted">(Placebo)</span>' : ''}</span>
                 <input type="checkbox" class="switch" data-act="pill" ${entry.pillTaken ? 'checked' : ''}></label>`}
          </section>` : ''}

          <section class="entry-sec"><h3>Notiz</h3>
            <textarea data-act="note" rows="3" maxlength="2000" placeholder="Alles, was du festhalten möchtest …">${esc(entry.note)}</textarea>
          </section>

          <button type="button" class="btn btn-primary btn-block" data-act="done">Fertig</button>
          <p class="hint center">Wird automatisch gespeichert.</p>`;
        body.scrollTop = scroll;
        if (addingSymptom) body.querySelector('[data-form="sym"] input')?.focus();
      }

      body.addEventListener('click', async (e) => {
        const t = e.target.closest('button, input[type="checkbox"]');
        if (!t) return;

        if (t.dataset.act === 'period') {
          await setPeriodDay(date, t.checked, today);
          entry = structuredClone(getDay(date));
          if (t.checked && !entry.flow) { entry.flow = 'medium'; await persist(); }
          render();
        } else if (t.dataset.flow) {
          entry.flow = entry.flow === t.dataset.flow ? null : t.dataset.flow;
          await persist(); render();
        } else if (t.dataset.sym) {
          const id = t.dataset.sym;
          entry.symptoms = entry.symptoms.includes(id) ? entry.symptoms.filter((s) => s !== id) : [...entry.symptoms, id];
          await persist(); render();
        } else if (t.dataset.act === 'add-sym') {
          addingSymptom = true; render();
        } else if (t.dataset.value) {
          const key = t.closest('[data-scale]').dataset.scale;
          const v = Number(t.dataset.value);
          entry[key] = entry[key] === v ? null : v;
          await persist(); render();
        } else if (t.dataset.act === 'sleep-minus' || t.dataset.act === 'sleep-plus') {
          const cur = entry.sleepHours ?? 7.5;
          const step = t.dataset.act === 'sleep-plus' ? 0.5 : -0.5;
          entry.sleepHours = entry.sleepHours == null ? 7.5 : Math.min(16, Math.max(0, cur + step));
          await persist(); render();
        } else if (t.dataset.act === 'sleep-set') {
          entry.sleepHours = entry.sleepHours == null ? 7.5 : null;
          await persist(); render();
        } else if (t.dataset.quickMed) {
          entry.meds = [...entry.meds, { id: uid('m'), name: t.dataset.quickMed, time: date === today ? nowTime() : '' }];
          await persist(); render();
          toast(`${t.dataset.quickMed} eingetragen`);
        } else if (t.dataset.delMed) {
          entry.meds = entry.meds.filter((m) => m.id !== t.dataset.delMed);
          await persist(); render();
        } else if (t.dataset.act === 'pill') {
          entry.pillTaken = t.checked ? true : null;
          await persist();
        } else if (t.dataset.act === 'done') {
          close();
        }
      });

      body.addEventListener('submit', async (e) => {
        e.preventDefault();
        const form = e.target;
        if (form.dataset.form === 'sym') {
          const sym = await addCustomSymptom(form.label.value);
          addingSymptom = false;
          if (sym && !entry.symptoms.includes(sym.id)) entry.symptoms = [...entry.symptoms, sym.id];
          await persist(); render();
        } else if (form.dataset.form === 'med') {
          const name = form.name.value.trim();
          if (!name) { form.name.focus(); return; }
          entry.meds = [...entry.meds, { id: uid('m'), name, time: form.time.value || '' }];
          await persist(); render();
        }
      });

      body.addEventListener('input', (e) => {
        if (e.target.dataset.act === 'note') {
          entry.note = e.target.value;
          saveNote();
        }
      });

      render();
    },
  });
}

"use client";

import { useEffect, useRef, useState } from "react";
import { Plus, X } from "lucide-react";
import { parseStepText, sectionsToText, stepId, stripNumbering, textToSections, type StepSection } from "@/lib/steps";
import { Segmented, cardCls, hintCls, sectionCls } from "./ui";

// A textarea that grows with its text instead of scrolling inside itself.
function GrowingTextarea({ value, className, ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { value: string }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight + 2}px`;
  }, [value]);
  return <textarea ref={ref} value={value} rows={1} className={`resize-none overflow-hidden ${className ?? ""}`} {...props} />;
}

const areaCls =
  "w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-[#3a352e] bg-white dark:bg-[#24211c] leading-[1.45] text-gray-900 dark:text-[#eae5de] placeholder:text-gray-500 dark:placeholder:text-[#8f877b] focus:outline-none focus:border-orange-500 dark:focus:border-orange-500";

export type StepsMode = "steps" | "text";

// Steps, edited one by one inside section cards, or all at once as text.
export default function StepsEditor({
  sections,
  onSections,
  mode,
  onMode,
  text,
  onText,
}: {
  sections: StepSection[];
  onSections: (next: StepSection[]) => void;
  mode: StepsMode;
  onMode: (m: StepsMode) => void;
  text: string;
  onText: (t: string) => void;
}) {
  // A step created from the keyboard (Enter, or pasting several lines) takes the focus.
  const [focusId, setFocusId] = useState<string | null>(null);

  function patchSection(si: number, patch: Partial<StepSection>) {
    onSections(sections.map((s, i) => (i === si ? { ...s, ...patch } : s)));
  }

  // A line break typed or pasted into a step splits it there, the same rule as text mode:
  // Enter starts the next step, and pasting a whole method makes one step per line. Line
  // breaks a step already has (old imports have them mid-sentence) are left alone.
  function editStep(si: number, ti: number, value: string) {
    const old = sections[si].steps[ti].text;
    let p = 0;
    while (p < old.length && p < value.length && old[p] === value[p]) p++;
    let e = 0;
    while (e < old.length - p && e < value.length - p && old[old.length - 1 - e] === value[value.length - 1 - e]) e++;
    const inserted = value.slice(p, value.length - e);
    const steps = [...sections[si].steps];
    if (!/\r?\n/.test(inserted)) {
      steps[ti] = { ...steps[ti], text: value };
      patchSection(si, { steps });
      return;
    }
    const parts = inserted.split(/\r?\n/);
    const head = value.slice(0, p);
    const first = (head + (head ? parts[0] : stripNumbering(parts[0].trim()))).trimEnd();
    const middle = parts.slice(1, -1).map((t) => stripNumbering(t.trim())).filter(Boolean);
    const last = (stripNumbering(parts[parts.length - 1].trimStart()) + value.slice(value.length - e)).trim();
    const added = [...middle, ...(last || middle.length === 0 ? [last] : [])].map((t) => ({ id: stepId(), text: t }));
    steps.splice(ti, 1, { ...steps[ti], text: first }, ...added);
    setFocusId(added[added.length - 1].id);
    patchSection(si, { steps });
  }

  function removeStep(si: number, ti: number) {
    patchSection(si, { steps: sections[si].steps.filter((_, i) => i !== ti) });
  }

  function addStep(si: number) {
    const st = { id: stepId(), text: "" };
    patchSection(si, { steps: [...sections[si].steps, st] });
    setFocusId(st.id);
  }

  // Removing a section removes its heading, never its steps: they join the section above.
  // The first section has nothing above it, so it just loses its name.
  function removeSection(si: number) {
    if (si === 0) {
      patchSection(0, { title: "" });
      return;
    }
    const next = sections.map((s, i) => (i === si - 1 ? { ...s, steps: [...s.steps, ...sections[si].steps] } : s));
    onSections(next.filter((_, i) => i !== si));
  }

  function switchMode(m: StepsMode) {
    if (m === mode) return;
    if (m === "text") onText(sectionsToText(sections));
    else onSections(textToSections(text));
    onMode(m);
  }

  const parsed = mode === "text" ? parseStepText(text) : [];
  const parsedSteps = parsed.reduce((n, s) => n + s.steps.length, 0);
  const parsedSections = parsed.filter((s) => s.title).length;

  // Steps are numbered across sections, as on the recipe page.
  const firstNum = sections.map((_, i) => 1 + sections.slice(0, i).reduce((n, s) => n + s.steps.length, 0));
  return (
    <section aria-labelledby="steps-title">
      <div className="mt-7 mb-2.5 flex items-center justify-between gap-3">
        <h2 id="steps-title" className={sectionCls}>Steps</h2>
        <Segmented
          label="How to edit steps"
          options={[{ value: "steps", label: "Step by step" }, { value: "text", label: "Text" }]}
          value={mode}
          onChange={(v) => v && switchMode(v)}
          buttonClassName="px-3"
        />
      </div>

      {mode === "steps" ? (
        <>
          {sections.map((sec, si) => (
            <div key={sec.id} className={`${cardCls} mb-3 px-3 pt-1 pb-2`}>
              <div className="flex items-center gap-1">
                <input
                  value={sec.title}
                  onChange={(e) => patchSection(si, { title: e.target.value })}
                  aria-label="Section name"
                  placeholder="Section name (optional)"
                  className="flex-1 min-w-0 h-11 bg-transparent text-base font-bold text-gray-900 dark:text-[#eae5de] placeholder:font-normal placeholder:text-gray-500 dark:placeholder:text-[#8f877b] focus:outline-none"
                />
                {(si > 0 || sec.title.trim() !== "") && (
                  <button
                    type="button"
                    onClick={() => removeSection(si)}
                    aria-label={`Remove section${sec.title ? ` ${sec.title}` : ""} (its steps stay)`}
                    title="Remove section — its steps stay"
                    className="w-10 h-10 -mr-1.5 shrink-0 rounded-[10px] flex items-center justify-center text-gray-500 dark:text-[#8f877b]"
                  >
                    <X size={16} />
                  </button>
                )}
              </div>
              {sec.steps.map((st, ti) => {
                const num = firstNum[si] + ti;
                return (
                  <div key={st.id} className="flex gap-2.5 mt-2">
                    <span
                      aria-hidden
                      className="w-7 h-7 mt-2.5 shrink-0 rounded-full bg-orange-50 dark:bg-orange-500/15 text-orange-700 dark:text-orange-400 text-sm font-bold flex items-center justify-center"
                    >
                      {num}
                    </span>
                    <GrowingTextarea
                      value={st.text}
                      onChange={(e) => editStep(si, ti, e.target.value)}
                      aria-label={`Step ${num}`}
                      placeholder={num === 1 ? "What to do first" : "Next"}
                      autoFocus={st.id === focusId}
                      className={`${areaCls} min-h-12 text-base`}
                    />
                    <button
                      type="button"
                      onClick={() => removeStep(si, ti)}
                      aria-label={`Delete step ${num}`}
                      className="w-10 h-10 mt-1 shrink-0 rounded-[10px] flex items-center justify-center text-gray-500 dark:text-[#8f877b]"
                    >
                      <X size={16} />
                    </button>
                  </div>
                );
              })}
              <button
                type="button"
                onClick={() => addStep(si)}
                className="mt-1 h-11 px-1 flex items-center gap-2 text-[15px] font-semibold text-orange-700 dark:text-orange-400"
              >
                <Plus size={18} aria-hidden /> Add step
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => onSections([...sections, { id: stepId(), title: "", steps: [{ id: stepId(), text: "" }] }])}
            className="w-full h-11 rounded-full border border-gray-200 dark:border-[#3a352e] bg-white dark:bg-[#24211c] text-sm font-semibold text-gray-900 dark:text-[#eae5de]"
          >
            + Section
          </button>
        </>
      ) : (
        <>
          <GrowingTextarea
            value={text}
            onChange={(e) => onText(e.target.value)}
            aria-label="Steps as text"
            aria-describedby="steps-text-hint"
            placeholder="Paste or write the whole method here"
            className={`${areaCls} min-h-[380px] text-[15px]`}
          />
          <p id="steps-text-hint" className={`mt-2 leading-[1.45] ${hintCls}`}>
            Paste or write freely. A line starting with # becomes a section, every other line a step; numbering like “1.” is
            dropped.{" "}
            <b className="font-semibold text-gray-900 dark:text-[#eae5de]">
              Reads as {parsedSteps} {parsedSteps === 1 ? "step" : "steps"}
              {parsedSections ? ` in ${parsedSections} ${parsedSections === 1 ? "section" : "sections"}` : ""}.
            </b>
          </p>
        </>
      )}
    </section>
  );
}

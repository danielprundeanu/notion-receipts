// Recipe steps as the edit form holds them: sections, each with a title (may be empty)
// and its steps. They're stored as flat Instruction rows — a section is a row with
// isSection, and the steps after it belong to it.
//
// Text mode writes the same thing as plain text: a line starting with # is a section,
// every other non-empty line a step, and numbering like "1." or "-" is dropped.

export type FormStep = { id: string; text: string };
export type StepSection = { id: string; title: string; steps: FormStep[] };

export function stepId(): string {
  return Math.random().toString(36).slice(2);
}

export function emptySection(): StepSection {
  return { id: stepId(), title: "", steps: [{ id: stepId(), text: "" }] };
}

// Notion imports put every header in one block above the steps ("Enjoy!", "Steps",
// "Ingredients"…), so none of them titles the steps under it. A block of two or more headers
// before the first step is left out, and so is any other header with no steps under it.
export function sectionsFromInstructions(rows: { text: string; isSection: boolean }[]): StepSection[] {
  let lead = 0;
  while (lead < rows.length && rows[lead].isSection) lead++;
  const out: StepSection[] = [];
  let cur: StepSection | null = null;
  for (const r of lead >= 2 ? rows.slice(lead) : rows) {
    if (r.isSection) {
      cur = { id: stepId(), title: r.text, steps: [] };
      out.push(cur);
      continue;
    }
    if (!cur) {
      cur = { id: stepId(), title: "", steps: [] };
      out.push(cur);
    }
    cur.steps.push({ id: stepId(), text: r.text });
  }
  const kept = out.filter((s) => s.steps.length > 0);
  return kept.length ? kept : [emptySection()];
}

// In text mode one line is one step, so a line break inside a step (old imports have them
// mid-sentence) becomes a space.
const oneLine = (t: string) => t.replace(/\s*\r?\n\s*/g, " ").trim();

export function sectionsToText(sections: StepSection[]): string {
  return sections
    .map((s) => {
      const lines = s.steps.map((st) => oneLine(st.text)).filter(Boolean);
      const title = oneLine(s.title);
      return (title ? [`# ${title}`, ...lines] : lines).join("\n");
    })
    .filter(Boolean)
    .join("\n\n");
}

const NUMBERING = /^(\d+[.)]|[-*•])\s+/;

/** "1. Boil the water" → "Boil the water". */
export function stripNumbering(line: string): string {
  return line.replace(NUMBERING, "");
}

/** Text mode → sections, without ids (also used to count what the text reads as). */
export function parseStepText(text: string): { title: string; steps: string[] }[] {
  const out: { title: string; steps: string[] }[] = [];
  let cur: { title: string; steps: string[] } | null = null;
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim();
    if (!t) continue;
    const heading = t.match(/^#+\s*(.*)$/);
    if (heading) {
      cur = { title: heading[1].trim(), steps: [] };
      out.push(cur);
      continue;
    }
    if (!cur) {
      cur = { title: "", steps: [] };
      out.push(cur);
    }
    cur.steps.push(stripNumbering(t));
  }
  return out;
}

export function textToSections(text: string): StepSection[] {
  const parsed = parseStepText(text);
  if (parsed.length === 0) return [emptySection()];
  return parsed.map((s) => ({
    id: stepId(),
    title: s.title,
    steps: s.steps.length ? s.steps.map((t) => ({ id: stepId(), text: t })) : [{ id: stepId(), text: "" }],
  }));
}

/** Sections → the Instruction rows createRecipe / updateRecipe store. Empty steps are dropped. */
export function sectionsToInstructions(
  sections: { title: string; steps: { text: string }[] }[]
): Array<{ text: string; isSection: boolean; step: number; instrType?: string }> {
  const rows: Array<{ text: string; isSection: boolean; instrType?: string }> = [];
  for (const s of sections) {
    const title = s.title.trim();
    if (title) rows.push({ text: title, isSection: true });
    for (const st of s.steps) {
      const t = st.text.trim();
      if (t) rows.push({ text: t, isSection: false, instrType: "numbered" });
    }
  }
  return rows.map((r, i) => ({ ...r, step: i + 1 }));
}

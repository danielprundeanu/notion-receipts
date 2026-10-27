"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import {
  Camera, Check, ChevronLeft, ChevronRight, CircleHelp, ClipboardPaste, FileText, ImageIcon, Loader2, Pencil,
  Sparkles, Upload, X,
} from "lucide-react";
import type { ParsedRecipe } from "@/lib/import";
import { formatAmount } from "@/lib/quantities";
import { standardFactor } from "@/lib/units";
import { Segmented, SheetGrabber, Switch, useSheetDrag } from "@/components/Sheet";
import { buildConfirm, itemOptions, newItemName, questionsFor, type Answer, type Answers, type ItemOption, type Question } from "./review";

// Add recipes: ask AI (links with notes, or a description), paste a recipe's text, or upload
// a photo/PDF — or go write one by hand. Each source is read one at a time with its own
// progress, the few things the matcher wasn't sure about become questions, and nothing is
// saved until "Add". A bottom sheet on phones, a wide dialog from md up.

type Mode = "ai" | "text" | "file";
type Step = "menu" | "working" | "review" | "done";
type Payload =
  | { kind: "link"; url: string; notes: string }
  | { kind: "describe"; prompt: string }
  | { kind: "text"; text: string; notes: string }
  | { kind: "file"; mediaType: string; data: string; notes: string };
type Job = { label: string; payload: Payload; status: "waiting" | "working" | "done" | "error"; recipe?: ParsedRecipe; error?: string };
type PickedFile = { name: string; meta: string; payload: Payload };

const LINK = /https?:\/\/[^\s<>"]+/g;

function host(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function plural(n: number, one: string, many: string) {
  return `${n} ${n === 1 ? one : many}`;
}

function toBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1] ?? "");
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

// Photos are scaled down before upload: phone pictures run to several MB, and the page
// text of a recipe reads fine at 1600 px.
async function readPickedFile(f: File): Promise<PickedFile> {
  const size = f.size > 1024 * 1024 ? `${(f.size / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(f.size / 1024))} KB`;
  if (f.type === "application/pdf") {
    if (f.size > 3 * 1024 * 1024) throw new Error("That PDF is over 3 MB. Export just the recipe's page.");
    return { name: f.name, meta: `PDF · ${size}`, payload: { kind: "file", mediaType: "application/pdf", data: await toBase64(f), notes: "" } };
  }
  if (f.type.startsWith("text/") || /\.(txt|md)$/i.test(f.name)) {
    return { name: f.name, meta: `Text · ${size}`, payload: { kind: "text", text: await f.text(), notes: "" } };
  }
  if (f.type.startsWith("image/")) {
    let bitmap: ImageBitmap;
    try {
      bitmap = await createImageBitmap(f);
    } catch {
      throw new Error("This photo format can't be read here. Use a JPG or PNG.");
    }
    const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", 0.85));
    if (!blob) throw new Error("Couldn't read this photo. Try another one.");
    return { name: f.name, meta: `Photo · ${size}`, payload: { kind: "file", mediaType: "image/jpeg", data: await toBase64(blob), notes: "" } };
  }
  throw new Error("Use a photo, a PDF or a text file.");
}

function ingredientLine(q: Question): string {
  const { qty, unit, name } = q.ing;
  const amount = qty != null ? `${formatAmount(qty, unit)}${unit && unit !== "piece" ? ` ${unit}` : ""} ` : "";
  return `${amount}${name}`;
}

const btnPrimary =
  "h-[52px] md:h-11 px-5 rounded-[14px] md:rounded-xl bg-orange-700 hover:bg-orange-800 text-white dark:bg-orange-500 dark:hover:bg-orange-400 dark:text-[#1a1714] text-base md:text-[15px] font-bold flex items-center justify-center gap-2 disabled:opacity-45 transition-colors";
const btnSecondary =
  "h-[52px] md:h-11 px-5 rounded-[14px] md:rounded-xl border border-gray-200 dark:border-[#3a352e] bg-white dark:bg-[#24211c] text-[15px] font-bold text-gray-900 dark:text-[#eae5de]";
const card = "rounded-2xl border border-gray-200 dark:border-[#3a352e] bg-white dark:bg-[#24211c]";
const muted = "text-gray-600 dark:text-[#a49c90]";
const areaCls =
  "w-full px-3.5 py-3 rounded-[14px] border bg-white dark:bg-[#24211c] text-[15px] leading-[1.5] text-gray-900 dark:text-[#eae5de] placeholder:text-gray-500 dark:placeholder:text-[#8f877b] focus:outline-none resize-none";

function QuestionCard({ q, recipeName, answer, onAnswer }: {
  q: Question;
  recipeName: string;
  answer: Answer | undefined;
  onAnswer: (patch: Partial<Answer>) => void;
}) {
  const conv = q.conversion;
  const options = q.needsItem ? itemOptions(q.ing) : [];
  const qty = q.ing.qty;
  const qtyText = qty != null && conv ? `${formatAmount(qty, conv.from)} ${conv.from}` : "";
  const name = newItemName(q.ing.name);
  const pick = answer?.pick;
  const remember = answer?.remember !== false;
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [found, setFound] = useState<{ q: string; items: ItemOption[] } | null>(null);
  const term = query.trim();
  useEffect(() => {
    if (term.length < 2) return;
    let cancelled = false;
    const t = setTimeout(() => {
      fetch(`/api/import/search-items?q=${encodeURIComponent(term)}`)
        .then((r) => (r.ok ? r.json() : []))
        .then((items: ItemOption[]) => {
          if (!cancelled) setFound({ q: term, items: Array.isArray(items) ? items : [] });
        })
        .catch(() => {
          if (!cancelled) setFound({ q: term, items: [] });
        });
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [term]);
  const results = found?.q === term ? found.items : null;
  const picked = pick?.type === "item" ? pick.item : null;
  // A searched pick that isn't among the suggestions still shows as chosen.
  const shownOptions = picked && !options.some((o) => o.id === picked.id) ? [...options, picked] : options;

  // The pair whose AI suggestion has come back (or failed); "suggesting" is derived from it.
  const [suggestedFor, setSuggestedFor] = useState<string | null>(null);

  // No standard conversion for this pair (a cup of flour in grams): ask AI for a starting value.
  const suggestFor = conv && answer?.factor === undefined && answer?.amount === undefined && standardFactor(conv.from, conv.target) == null
    ? `${conv.item.name}|${conv.from}|${conv.target}`
    : null;
  const suggesting = suggestFor !== null && suggestedFor !== suggestFor;
  const latest = useRef(onAnswer);
  useEffect(() => {
    latest.current = onAnswer;
  });
  useEffect(() => {
    if (!suggestFor) return;
    const [ingredientName, fromUnit, toUnit] = suggestFor.split("|");
    let cancelled = false;
    fetch("/api/import/suggest-conversion", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ingredientName, fromUnit, toUnit }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { factor?: number } | null) => {
        if (!cancelled && d?.factor) latest.current({ factor: String(Number(d.factor.toFixed(4))) });
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setSuggestedFor(suggestFor);
      });
    return () => {
      cancelled = true;
    };
  }, [suggestFor]);

  const pill = (on: boolean) =>
    `min-h-10 px-3.5 py-2 rounded-xl border text-sm text-left transition-colors ${
      on
        ? "border-orange-600 dark:border-orange-500 bg-orange-50 dark:bg-orange-500/15 font-semibold text-gray-900 dark:text-[#eae5de]"
        : "border-gray-200 dark:border-[#3a352e] bg-[var(--color-bg-base)] text-gray-900 dark:text-[#eae5de]"
    }`;
  const newPill = (
    <button key="new" type="button" aria-pressed={pick?.type === "new"} onClick={() => onAnswer({ pick: { type: "new" }, amount: undefined, factor: undefined, target: undefined })} className={pill(pick?.type === "new")}>
      {q.ing.match.status === "new" ? `Add “${name}” as new` : "A new item"}
    </button>
  );

  return (
    <div className={`${card} p-3`}>
      <p className={`text-[13px] ${muted}`}>{recipeName}</p>
      <p className="mt-1 text-[15px] font-semibold text-gray-900 dark:text-[#eae5de]">“{ingredientLine(q)}”</p>
      {q.needsItem && (
        <>
          <p className={`mt-1 mb-2.5 text-sm ${muted}`}>
            {q.ing.match.status === "similar" ? "Which of your ingredients is it?" : `${name} isn't in your ingredients yet.`}
          </p>
          <div role="group" aria-label={`Ingredient for ${q.ing.name}`} className="flex flex-wrap gap-1.5">
            {q.ing.match.status === "new" && newPill}
            {shownOptions.map((o) => {
              const on = picked?.id === o.id;
              return (
                <button key={o.id} type="button" aria-pressed={on} onClick={() => onAnswer({ pick: { type: "item", item: o }, amount: undefined, factor: undefined, target: undefined })} className={pill(on)}>
                  {q.ing.match.status === "new" ? `Use ${o.name}` : o.name}
                </button>
              );
            })}
            {q.ing.match.status !== "new" && newPill}
            {!searchOpen && (
              <button type="button" onClick={() => setSearchOpen(true)} className={`${pill(false)} border-dashed text-orange-700 dark:text-orange-400`}>
                Something else…
              </button>
            )}
          </div>
          {searchOpen && (
            <div className="mt-2">
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                autoFocus
                autoComplete="off"
                aria-label={`Search your ingredients for ${q.ing.name}`}
                placeholder="Search your ingredients"
                className="w-full h-11 px-3 rounded-xl border border-gray-200 dark:border-[#3a352e] bg-[var(--color-bg-base)] text-base text-gray-900 dark:text-[#eae5de] placeholder:text-gray-500 dark:placeholder:text-[#8f877b] focus:outline-none focus:border-orange-500"
              />
              {term.length >= 2 && (
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {results === null ? (
                    <Loader2 size={16} className="animate-spin text-gray-500" aria-label="Searching" />
                  ) : results.length === 0 ? (
                    <p className={`text-[13px] ${muted}`}>Nothing called that. Add it as a new item above.</p>
                  ) : (
                    results.map((o) => (
                      <button
                        key={o.id}
                        type="button"
                        onClick={() => { onAnswer({ pick: { type: "item", item: o }, amount: undefined, factor: undefined, target: undefined }); setSearchOpen(false); setQuery(""); }}
                        className={pill(picked?.id === o.id)}
                      >
                        {o.name}
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
          )}
        </>
      )}
      {conv && (
        <div className="mt-3">
          <p className={`text-sm ${muted}`}>
            {conv.item.name} is measured in {conv.units.join(" or ")}.{" "}
            {qty ? `${qtyText} of it is how much?` : `How much is 1 ${conv.from}?`}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="text-[15px] font-semibold text-gray-900 dark:text-[#eae5de]">{qty ? qtyText : `1 ${conv.from}`} =</span>
            <input
              inputMode="decimal"
              autoComplete="off"
              aria-label={qty ? `${qtyText} of ${conv.item.name} in ${conv.target}` : `How many ${conv.target} make 1 ${conv.from}`}
              value={
                qty
                  ? answer?.amount ?? (conv.factor != null ? String(Number((qty * conv.factor).toFixed(2))) : "")
                  : answer?.factor ?? (conv.factor != null ? String(conv.factor) : "")
              }
              onChange={(e) => {
                const v = e.target.value.replace(/[^\d.,]/g, "");
                onAnswer(qty ? { amount: v } : { factor: v });
              }}
              placeholder={suggesting ? "…" : "?"}
              className="w-20 h-10 px-2.5 rounded-xl border border-gray-200 dark:border-[#3a352e] bg-[var(--color-bg-base)] text-center text-base text-gray-900 dark:text-[#eae5de] focus:outline-none focus:border-orange-500"
            />
            {conv.units.map((u) => (
              <button key={u} type="button" aria-pressed={conv.target === u} onClick={() => onAnswer({ target: u, amount: undefined, factor: undefined })} className={pill(conv.target === u)}>
                {u}
              </button>
            ))}
            {suggesting && <Loader2 size={16} className="animate-spin text-gray-500" aria-label="Suggesting a value" />}
          </div>
          {conv.units.length === 1 && (
            <div className="mt-2 flex items-center justify-between gap-3">
              <span className={`text-[13px] ${muted}`}>Also keep “{conv.from}” on {conv.item.name}</span>
              <Switch on={!!answer?.keepUnit} onChange={(on) => onAnswer({ keepUnit: on })} label={`Keep ${conv.from} as a second unit on ${conv.item.name}`} />
            </div>
          )}
        </div>
      )}
      {(q.ing.match.status !== "matched" && pick?.type === "item") || (conv && !answer?.keepUnit) ? (
        <div className="mt-1 flex items-center justify-between gap-3">
          <span className={`text-[13px] ${muted}`}>Remember for next imports</span>
          <Switch on={remember} onChange={(on) => onAnswer({ remember: on })} label="Remember this answer for next imports" />
        </div>
      ) : null}
    </div>
  );
}

export default function AddRecipes({ onClose, onAdded }: { onClose: () => void; onAdded: (recipeIds: string[]) => void }) {
  const titleId = useId();
  const [step, setStep] = useState<Step>("menu");
  const [mode, setMode] = useState<Mode>("ai");
  const [prompt, setPrompt] = useState("");
  const [pasted, setPasted] = useState("");
  const [file, setFile] = useState<PickedFile | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [skip, setSkip] = useState<Set<number>>(new Set());
  const [answers, setAnswers] = useState<Answers>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [added, setAdded] = useState(0);
  const aiRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const links = prompt.match(LINK) ?? [];
  const notes = prompt.replace(LINK, " ").replace(/\s+/g, " ").trim();
  const recipes = jobs.flatMap((j) => (j.status === "done" && j.recipe ? [j.recipe] : []));
  const jobOfRecipe = jobs.flatMap((j, i) => (j.status === "done" && j.recipe ? [i] : []));
  const questions = step === "review" ? questionsFor(recipes, answers, skip) : [];
  const unanswered = questions.filter((q) => !q.answered).length;
  const kept = recipes.filter((_, i) => !skip.has(i)).length;
  const finished = jobs.length > 0 && jobs.every((j) => j.status === "done" || j.status === "error");
  const busy = step === "working" || (step === "review" && kept > 0);

  function close() {
    if (saving) return;
    if (busy && !window.confirm("Leave without adding these recipes?")) return;
    onClose();
  }
  const { panelRef, grabberProps } = useSheetDrag(close);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  async function run(list: Job[]) {
    setJobs(list);
    setSkip(new Set());
    setAnswers({});
    setSaveError(null);
    setStep("working");
    // One at a time: each shows its own progress, and a slow site doesn't hold up the rest.
    for (let i = 0; i < list.length; i++) {
      if (!alive.current) return;
      setJobs((js) => js.map((j, k) => (k === i ? { ...j, status: "working" } : j)));
      try {
        const res = await fetch("/api/import/ai", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(list[i].payload),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.recipe) throw new Error(data.error ?? `Couldn't read it (error ${res.status}).`);
        setJobs((js) => js.map((j, k) => (k === i ? { ...j, status: "done", recipe: data.recipe as ParsedRecipe } : j)));
      } catch (err) {
        const msg = err instanceof TypeError ? "Couldn't reach the server. Check the connection." : err instanceof Error ? err.message : "Couldn't read it.";
        setJobs((js) => js.map((j, k) => (k === i ? { ...j, status: "error", error: msg } : j)));
      }
    }
  }

  function start() {
    if (mode === "ai") {
      if (!prompt.trim()) return;
      run(
        links.length
          ? [...new Set(links)].map((url) => ({ label: host(url), payload: { kind: "link", url, notes }, status: "waiting" }))
          : [{ label: "Your description", payload: { kind: "describe", prompt: prompt.trim() }, status: "waiting" }]
      );
    } else if (mode === "text") {
      if (!pasted.trim()) return;
      run([{ label: "Pasted text", payload: { kind: "text", text: pasted, notes: "" }, status: "waiting" }]);
    } else if (file) {
      run([{ label: file.name, payload: file.payload, status: "waiting" }]);
    }
  }

  async function pickFile(f: File | undefined) {
    if (!f) return;
    setFileError(null);
    setReading(true);
    try {
      setFile(await readPickedFile(f));
    } catch (err) {
      setFile(null);
      setFileError(err instanceof Error ? err.message : "Couldn't read this file.");
    } finally {
      setReading(false);
    }
  }

  async function pasteFromClipboard() {
    try {
      const text = await navigator.clipboard.readText();
      if (text) setPrompt((p) => (p.trim() ? `${p.trimEnd()}\n${text}` : text));
    } catch {
      // No clipboard permission: the field takes a normal paste.
    }
    aiRef.current?.focus();
  }

  async function save() {
    setSaving(true);
    setSaveError(null);
    try {
      const payload = buildConfirm(recipes, answers, skip);
      const res = await fetch("/api/import/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        // Each recipe saves on its own: some may be in already.
        const done: string[] = data.recipeIds ?? [];
        if (done.length) onAdded(done);
        setSaveError(
          done.length
            ? `Added ${done.length} of ${payload.recipes.length}, then it failed: ${data.error ?? "unknown error"}. Check Recipes before trying again.`
            : data.error ?? "Couldn't add them. Please try again."
        );
        return;
      }
      setAdded(data.recipeIds?.length ?? payload.recipes.length);
      onAdded(data.recipeIds ?? []);
      setStep("done");
    } catch {
      setSaveError("Couldn't add them. Check the connection and try again.");
    } finally {
      setSaving(false);
    }
  }

  function reset() {
    setStep("menu");
    setMode("ai");
    setPrompt("");
    setPasted("");
    setFile(null);
    setJobs([]);
  }

  // ── Footer ──
  let footer: { label: string; disabled: boolean; act: () => void; note?: string } | null = null;
  if (step === "menu") {
    footer = mode === "ai"
      ? { label: links.length ? `Create ${plural(links.length, "recipe", "recipes")}` : prompt.trim() ? "Create from description" : "Create recipes", disabled: !prompt.trim(), act: start }
      : { label: "Continue", disabled: mode === "text" ? !pasted.trim() : !file, act: start };
    footer.note = "Nothing is saved until you check it.";
  } else if (step === "working") {
    const ok = jobs.filter((j) => j.status === "done").length;
    footer = finished
      ? ok > 0
        ? { label: `Review ${plural(ok, "recipe", "recipes")}`, disabled: false, act: () => setStep("review") }
        : { label: "Back", disabled: false, act: () => setStep("menu") }
      : { label: "Working on it…", disabled: true, act: () => {} };
  } else if (step === "review") {
    footer = {
      label: kept === 0 ? "Nothing to add" : unanswered ? `Answer ${plural(unanswered, "question", "questions")} to add` : `Add ${plural(kept, "recipe", "recipes")}`,
      disabled: kept === 0 || unanswered > 0 || saving,
      act: save,
      note: questions.length ? "Answers you remember are used next time." : undefined,
    };
  }

  const title =
    step === "menu" ? "Add recipes"
      : step === "working" ? (jobs.length > 1 ? `Creating ${plural(jobs.length, "recipe", "recipes")}` : "Reading your recipe")
        : step === "review" ? "Check before adding" : "";
  const subMode = step === "menu" && mode !== "ai";

  const aiPanel = (
    <div>
      <div className="flex items-center gap-2">
        <Sparkles size={18} className="text-orange-700 dark:text-orange-400" aria-hidden />
        <label htmlFor="add-ai" className="flex-1 text-[15px] font-semibold text-gray-900 dark:text-[#eae5de]">Ask AI</label>
        <button type="button" onClick={pasteFromClipboard} className="h-9 px-2.5 rounded-[10px] bg-gray-100 dark:bg-[#2e2a24] text-[13px] font-semibold text-gray-900 dark:text-[#eae5de] flex items-center gap-1.5">
          <ClipboardPaste size={15} aria-hidden /> Paste
        </button>
      </div>
      <textarea
        id="add-ai"
        ref={aiRef}
        rows={7}
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        aria-describedby="add-ai-hint"
        placeholder="Paste recipe links, one per line. Add notes in plain words, like “2 servings each”."
        className={`${areaCls} mt-2.5 md:min-h-[260px] border-orange-600 dark:border-orange-500`}
      />
      <p id="add-ai-hint" className={`mt-2 text-[13px] leading-[1.45] ${muted}`}>
        {links.length
          ? `${plural(links.length, "link", "links")} found${notes ? ` · notes: “${notes}”` : ""}`
          : prompt.trim()
            ? "No links, so it writes a recipe from what you describe."
            : "Links from any recipe site, one per line. It matches your ingredients and only asks when it isn't sure."}
      </p>
    </div>
  );

  const textPanel = (
    <div>
      <label htmlFor="add-text" className="block text-[15px] font-semibold text-gray-900 dark:text-[#eae5de]">Paste a recipe&apos;s text</label>
      <textarea
        id="add-text"
        rows={12}
        value={pasted}
        onChange={(e) => setPasted(e.target.value)}
        placeholder="Paste the whole recipe: title, ingredients and steps. Any language."
        className={`${areaCls} mt-2.5 border-gray-200 dark:border-[#3a352e] focus:border-orange-500`}
      />
      <p className={`mt-2 text-[13px] leading-[1.45] ${muted}`}>
        It splits the text into ingredients and steps and matches your ingredients. You check it before it&apos;s saved.
      </p>
    </div>
  );

  const filePanel = (
    <div>
      <p className="text-[15px] font-semibold text-gray-900 dark:text-[#eae5de]">Upload a photo or PDF</p>
      <input ref={fileRef} type="file" accept="image/*,application/pdf,text/plain,.txt,.md" className="hidden" onChange={(e) => { pickFile(e.target.files?.[0]); e.target.value = ""; }} />
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { pickFile(e.target.files?.[0]); e.target.value = ""; }} />
      {file ? (
        <div className={`${card} mt-2.5 p-2.5 pr-1 flex items-center gap-3`}>
          <span className="w-10 h-10 rounded-xl bg-gray-100 dark:bg-[#2e2a24] flex items-center justify-center shrink-0">
            {file.payload.kind === "file" && file.payload.mediaType.startsWith("image/") ? <ImageIcon size={18} aria-hidden /> : <FileText size={18} aria-hidden />}
          </span>
          <span className="flex-1 min-w-0">
            <span className="block text-[15px] font-semibold truncate text-gray-900 dark:text-[#eae5de]">{file.name}</span>
            <span className={`block mt-0.5 text-[13px] ${muted}`}>{file.meta}</span>
          </span>
          <button type="button" onClick={() => setFile(null)} aria-label="Remove file" className="w-11 h-11 rounded-xl flex items-center justify-center text-gray-500 dark:text-[#a49c90]">
            <X size={18} />
          </button>
        </div>
      ) : (
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => { e.preventDefault(); setDragOver(false); pickFile(e.dataTransfer.files?.[0]); }}
          className={`mt-2.5 px-4 py-7 md:py-11 rounded-[18px] border-2 border-dashed text-center transition-colors ${
            dragOver ? "border-orange-500 bg-orange-50 dark:bg-orange-500/10" : "border-gray-200 dark:border-[#3a352e]"
          }`}
        >
          <span className="w-[52px] h-[52px] mx-auto rounded-2xl bg-gray-100 dark:bg-[#2e2a24] flex items-center justify-center text-gray-900 dark:text-[#eae5de]">
            {reading ? <Loader2 size={22} className="animate-spin" aria-label="Reading the file" /> : <Upload size={22} aria-hidden />}
          </span>
          <p className="mt-3 mb-1 text-base font-semibold text-gray-900 dark:text-[#eae5de]">A photo, PDF or text file</p>
          <p className={`mb-4 text-[13px] leading-[1.45] ${muted}`}>A cookbook page, a screenshot or a handwritten card works too.</p>
          <div className="flex flex-wrap justify-center gap-2">
            <button type="button" onClick={() => fileRef.current?.click()} disabled={reading} className="h-11 px-4 rounded-xl border border-gray-200 dark:border-[#3a352e] bg-white dark:bg-[#24211c] text-[15px] font-semibold text-gray-900 dark:text-[#eae5de]">
              Choose a file
            </button>
            <button type="button" onClick={() => cameraRef.current?.click()} disabled={reading} className="md:hidden h-11 px-4 rounded-xl border border-gray-200 dark:border-[#3a352e] bg-white dark:bg-[#24211c] text-[15px] font-semibold text-gray-900 dark:text-[#eae5de] flex items-center gap-2">
              <Camera size={17} aria-hidden /> Take a photo
            </button>
          </div>
        </div>
      )}
      {fileError && <p role="alert" className="mt-2 text-sm text-red-600 dark:text-red-400">{fileError}</p>}
    </div>
  );

  const way = (on: boolean) =>
    `w-full min-h-16 flex items-center gap-3 px-3 py-2 rounded-2xl border text-left bg-white dark:bg-[#24211c] ${
      on ? "border-orange-600 dark:border-orange-500" : "border-gray-200 dark:border-[#3a352e]"
    }`;
  const wayIcon = "w-10 h-10 rounded-xl bg-gray-100 dark:bg-[#2e2a24] flex items-center justify-center shrink-0 text-gray-900 dark:text-[#eae5de]";

  return (
    <div
      className="fixed inset-0 z-[60] bg-black/55 flex flex-col justify-end md:items-center md:justify-center md:p-6"
      onClick={(e) => { if (e.target === e.currentTarget) close(); }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={`w-full md:max-w-[920px] bg-[var(--color-bg-base)] rounded-t-3xl md:rounded-3xl md:border md:border-gray-200 md:dark:border-[#3a352e] shadow-xl flex flex-col ${
          step === "menu" || step === "done" ? "max-h-[92dvh]" : "h-[92dvh] md:h-[min(760px,90dvh)]"
        } md:max-h-[90dvh]`}
      >
        <div className="px-4 md:px-6 pt-2.5 md:pt-4 pb-1 md:pb-3 md:border-b md:border-gray-200 md:dark:border-[#3a352e] shrink-0">
          <SheetGrabber drag={grabberProps} className="pb-1.5" />
          <div className="min-h-12 flex items-center gap-1">
            {subMode && (
              <button type="button" onClick={() => setMode("ai")} aria-label="Back" className="md:hidden w-11 h-11 -ml-2.5 rounded-xl flex items-center justify-center text-gray-900 dark:text-[#eae5de]">
                <ChevronLeft size={20} />
              </button>
            )}
            <h2 id={titleId} className="flex-1 text-xl font-bold text-gray-900 dark:text-[#eae5de]">
              {subMode ? <span className="md:hidden">Import text or file</span> : null}
              <span className={subMode ? "hidden md:inline" : ""}>{title}</span>
            </h2>
            <button type="button" onClick={close} aria-label="Close" className="w-11 h-11 -mr-2.5 rounded-xl flex items-center justify-center text-gray-500 dark:text-[#a49c90]">
              <X size={20} />
            </button>
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-4 md:px-6 py-2 md:py-5">
          {step === "menu" && (
            <div className="flex flex-col md:flex-row gap-6">
              <div className="flex-[3] min-w-0">
                {subMode && (
                  <Segmented
                    label="Import from"
                    options={[{ value: "text", label: "Paste text" }, { value: "file", label: "File" }]}
                    value={mode}
                    onChange={(v) => v && setMode(v)}
                    className="md:hidden mb-3"
                  />
                )}
                {mode === "ai" ? aiPanel : mode === "text" ? textPanel : filePanel}
                {mode === "ai" && (
                  <div className="md:hidden">
                    <div className={`my-4 flex items-center gap-3 text-[13px] ${muted}`}>
                      <span className="flex-1 h-px bg-gray-200 dark:bg-[#3a352e]" />or<span className="flex-1 h-px bg-gray-200 dark:bg-[#3a352e]" />
                    </div>
                    <div className="flex flex-col gap-2">
                      <Link href="/recipes/new" onClick={onClose} className={way(false)}>
                        <span className={wayIcon}><Pencil size={18} aria-hidden /></span>
                        <span className="flex-1 min-w-0">
                          <span className="block text-base font-semibold text-gray-900 dark:text-[#eae5de]">Write it yourself</span>
                          <span className={`block mt-0.5 text-[13px] ${muted}`}>Start from a blank recipe</span>
                        </span>
                        <ChevronRight size={16} aria-hidden className="text-gray-400" />
                      </Link>
                      <button type="button" onClick={() => setMode("text")} className={way(false)}>
                        <span className={wayIcon}><FileText size={18} aria-hidden /></span>
                        <span className="flex-1 min-w-0">
                          <span className="block text-base font-semibold text-gray-900 dark:text-[#eae5de]">Import text or file</span>
                          <span className={`block mt-0.5 text-[13px] ${muted}`}>Paste a recipe, or a photo or PDF of one</span>
                        </span>
                        <ChevronRight size={16} aria-hidden className="text-gray-400" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
              <div className="hidden md:flex flex-[2] min-w-0 flex-col gap-2">
                <p className={`mb-0.5 text-[13px] font-semibold uppercase tracking-[.04em] ${muted}`}>Other ways</p>
                <button type="button" onClick={() => setMode("ai")} aria-pressed={mode === "ai"} className={way(mode === "ai")}>
                  <span className={wayIcon}><Sparkles size={18} className="text-orange-700 dark:text-orange-400" aria-hidden /></span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-[15px] font-semibold text-gray-900 dark:text-[#eae5de]">Ask AI</span>
                    <span className={`block mt-0.5 text-[13px] ${muted}`}>From links, or a description</span>
                  </span>
                </button>
                <Link href="/recipes/new" onClick={onClose} className={way(false)}>
                  <span className={wayIcon}><Pencil size={18} aria-hidden /></span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-[15px] font-semibold text-gray-900 dark:text-[#eae5de]">Write it yourself</span>
                    <span className={`block mt-0.5 text-[13px] ${muted}`}>Start from a blank recipe</span>
                  </span>
                  <ChevronRight size={16} aria-hidden className="text-gray-400" />
                </Link>
                <button type="button" onClick={() => setMode("text")} aria-pressed={mode === "text"} className={way(mode === "text")}>
                  <span className={wayIcon}><FileText size={18} aria-hidden /></span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-[15px] font-semibold text-gray-900 dark:text-[#eae5de]">Paste a recipe&apos;s text</span>
                    <span className={`block mt-0.5 text-[13px] ${muted}`}>From a message, a note, or a site that blocks links</span>
                  </span>
                </button>
                <button type="button" onClick={() => setMode("file")} aria-pressed={mode === "file"} className={way(mode === "file")}>
                  <span className={wayIcon}><Upload size={18} aria-hidden /></span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-[15px] font-semibold text-gray-900 dark:text-[#eae5de]">Upload a photo or PDF</span>
                    <span className={`block mt-0.5 text-[13px] ${muted}`}>A cookbook page or a handwritten card</span>
                  </span>
                </button>
              </div>
            </div>
          )}

          {step === "working" && (
            <>
              <p className={`mb-3 text-sm ${muted}`}>
                Reading {jobs.length > 1 ? "each one" : "it"} and matching the ingredients to yours. Questions wait until the end.
              </p>
              <ul className="grid gap-2 md:grid-cols-2">
                {jobs.map((j, i) => {
                  const r = j.recipe;
                  const qs = r ? questionsFor([r], {}, new Set()).length : 0;
                  return (
                    <li key={i} className={`${card} p-3 flex items-center gap-3`}>
                      {j.status === "working" ? (
                        <Loader2 size={22} className="animate-spin text-orange-700 dark:text-orange-400 shrink-0" aria-hidden />
                      ) : j.status === "waiting" ? (
                        <span className="w-[22px] h-[22px] rounded-full border-2 border-dotted border-gray-400 dark:border-[#8f877b] shrink-0" aria-hidden />
                      ) : j.status === "error" ? (
                        <span className="w-[22px] h-[22px] rounded-full bg-red-50 dark:bg-red-500/15 text-red-600 dark:text-red-400 flex items-center justify-center shrink-0" aria-hidden><X size={14} strokeWidth={3} /></span>
                      ) : qs ? (
                        <CircleHelp size={22} className="text-orange-700 dark:text-orange-400 shrink-0" aria-hidden />
                      ) : (
                        <span className="w-[22px] h-[22px] rounded-full bg-teal-50 dark:bg-teal-500/15 text-teal-700 dark:text-teal-300 flex items-center justify-center shrink-0" aria-hidden><Check size={14} strokeWidth={3} /></span>
                      )}
                      <span className="flex-1 min-w-0">
                        <span className="block text-[15px] font-semibold truncate text-gray-900 dark:text-[#eae5de]">{r?.name ?? j.label}</span>
                        <span className={`block mt-0.5 text-[13px] ${j.status === "error" ? "text-red-600 dark:text-red-400" : muted}`}>
                          {j.status === "waiting" ? "Waiting"
                            : j.status === "working" ? "Reading and matching…"
                              : j.status === "error" ? j.error
                                : qs ? `${plural(qs, "question", "questions")} for you` : `Ready · ${plural(r!.ingredients.length, "ingredient", "ingredients")}`}
                        </span>
                      </span>
                    </li>
                  );
                })}
              </ul>
            </>
          )}

          {step === "review" && (
            <div className="flex flex-col-reverse md:flex-row gap-5 md:gap-6">
              <section className="flex-[3] min-w-0" aria-labelledby="add-list">
                <h3 id="add-list" className={`mb-2 text-[13px] font-semibold uppercase tracking-[.04em] ${muted}`}>
                  {plural(kept, "recipe", "recipes")} to add
                </h3>
                <ul className="flex flex-col gap-2">
                  {recipes.map((r, i) => {
                    const off = skip.has(i);
                    const img = r.image && /^https?:\/\//.test(r.image) ? r.image : null;
                    return (
                      <li key={i} className={`${card} py-2 pl-2 pr-1 flex items-center gap-3 ${off ? "opacity-55" : ""}`}>
                        {img ? (
                          // eslint-disable-next-line @next/next/no-img-element -- a source site's image; next/image only allows the blob host
                          <img src={img} alt="" className="w-14 h-14 rounded-xl object-cover shrink-0" />
                        ) : (
                          <span aria-hidden className="w-14 h-14 rounded-xl bg-gray-100 dark:bg-[#2e2a24] flex items-center justify-center shrink-0 font-[family-name:var(--font-serif)] text-2xl text-orange-600 dark:text-orange-400">
                            {r.name.charAt(0)}
                          </span>
                        )}
                        <span className="flex-1 min-w-0">
                          <span className="block text-[15px] font-semibold leading-snug line-clamp-2 text-gray-900 dark:text-[#eae5de]">{r.name}</span>
                          <span className={`block mt-0.5 text-[13px] truncate ${muted}`}>
                            {off
                              ? "Left out"
                              : [r.servings ? plural(r.servings, "serving", "servings") : null, plural(r.ingredients.length, "ingredient", "ingredients"), jobs[jobOfRecipe[i]]?.payload.kind === "link" ? host(r.link ?? "") : null]
                                  .filter(Boolean)
                                  .join(" · ")}
                          </span>
                        </span>
                        <button
                          type="button"
                          onClick={() => setSkip((s) => { const n = new Set(s); if (off) n.delete(i); else n.add(i); return n; })}
                          className={`h-11 px-3 rounded-xl text-sm font-semibold ${off ? "text-orange-700 dark:text-orange-400" : muted}`}
                        >
                          {off ? "Undo" : "Leave out"}
                        </button>
                      </li>
                    );
                  })}
                  {jobs.filter((j) => j.status === "error").map((j, i) => (
                    <li key={`e${i}`} className={`${card} p-3`}>
                      <p className="text-[15px] font-semibold truncate text-gray-900 dark:text-[#eae5de]">{j.label}</p>
                      <p className="mt-0.5 text-[13px] text-red-600 dark:text-red-400">{j.error}</p>
                    </li>
                  ))}
                </ul>
              </section>
              <section className="flex-[2] min-w-0" aria-labelledby="add-questions">
                <h3 id="add-questions" className={`mb-2 text-[13px] font-semibold uppercase tracking-[.04em] ${muted}`}>
                  {questions.length ? plural(questions.length, "question", "questions") : "Questions"}
                </h3>
                {questions.length === 0 ? (
                  <p className="p-3.5 rounded-2xl bg-teal-50 dark:bg-teal-500/10 text-sm text-gray-900 dark:text-[#eae5de]">
                    Every ingredient matched one of yours.
                  </p>
                ) : (
                  <div className="flex flex-col gap-2.5">
                    {questions.map((q) => (
                      <QuestionCard
                        key={q.key}
                        q={q}
                        recipeName={recipes[q.recipe].name}
                        answer={answers[q.key]}
                        onAnswer={(patch) => setAnswers((a) => ({ ...a, [q.key]: { ...a[q.key], ...patch } }))}
                      />
                    ))}
                  </div>
                )}
              </section>
            </div>
          )}

          {step === "done" && (
            <div className="py-10 px-4 text-center">
              <span aria-hidden className="w-16 h-16 mx-auto rounded-full bg-teal-50 dark:bg-teal-500/15 text-teal-700 dark:text-teal-300 flex items-center justify-center">
                <Check size={30} strokeWidth={2.5} />
              </span>
              <p className="mt-4 mb-1.5 text-[22px] font-bold text-gray-900 dark:text-[#eae5de]">{plural(added, "recipe", "recipes")} added</p>
              <p className={`text-[15px] ${muted}`}>They&apos;re at the top of your recipes.</p>
            </div>
          )}
        </div>

        <div
          className="px-4 md:px-6 pt-3 md:pb-4 border-t border-gray-200 dark:border-[#3a352e] shrink-0"
          style={{ paddingBottom: "max(1.25rem, env(safe-area-inset-bottom))" }}
        >
          {saveError && <p role="alert" className="mb-2.5 text-sm text-red-600 dark:text-red-400">{saveError}</p>}
          {step === "done" ? (
            <div className="flex gap-2.5 md:justify-end">
              <button type="button" onClick={reset} className={btnSecondary}>Add more</button>
              <button type="button" onClick={onClose} className={`${btnPrimary} flex-1 md:flex-none`}>Done</button>
            </div>
          ) : footer ? (
            <div className="flex items-center gap-3">
              {footer.note && <p className={`hidden md:block flex-1 text-[13px] ${muted}`}>{footer.note}</p>}
              <button type="button" onClick={footer.act} disabled={footer.disabled} className={`${btnPrimary} flex-1 md:flex-none`}>
                {(saving || (step === "working" && !finished)) && <Loader2 size={18} className="animate-spin" aria-hidden />}
                {mode === "ai" && step === "menu" && <Sparkles size={17} aria-hidden />}
                {footer.label}
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}


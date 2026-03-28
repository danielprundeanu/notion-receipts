import { NextRequest, NextResponse } from "next/server";
import { spawn } from "child_process";
import path from "path";

const PYTHON = path.resolve(process.cwd(), "../.venv/bin/python3");
const HANDLER = path.resolve(process.cwd(), "../scripts/web_import_handler.py");

function callPythonNormalize(text: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn(PYTHON, [HANDLER, "--mode", "normalize-text"], { timeout: 30000 });
    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (d: Buffer) => { stdout += d.toString(); });
    proc.stderr.on("data", (d: Buffer) => { stderr += d.toString(); });
    proc.on("close", (code) => {
      if (stderr) console.warn("[normalize-python]", stderr.slice(0, 300));
      if (code !== 0) return reject(new Error(`Python exited ${code}: ${stderr.slice(0, 200)}`));
      try {
        const data = JSON.parse(stdout) as { text?: string; error?: string };
        if (data.error) return reject(new Error(data.error));
        resolve(data.text ?? text);
      } catch {
        reject(new Error(`JSON parse error: ${stdout.slice(0, 200)}`));
      }
    });
    proc.on("error", reject);
    proc.stdin.write(JSON.stringify({ text }));
    proc.stdin.end();
  });
}

export async function POST(req: NextRequest) {
  const { text } = (await req.json()) as { text: string };
  if (!text?.trim()) {
    return NextResponse.json({ error: "Text gol" }, { status: 400 });
  }

  try {
    const normalized = await callPythonNormalize(text);
    return NextResponse.json({ text: normalized });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Eroare la normalizare" },
      { status: 500 }
    );
  }
}

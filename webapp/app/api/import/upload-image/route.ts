import { NextRequest, NextResponse } from "next/server";
import { writeFile } from "fs/promises";
import path from "path";
import crypto from "crypto";

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const file = form.get("file") as File | null;
    if (!file) return NextResponse.json({ error: "Niciun fișier" }, { status: 400 });

    const allowed = ["image/jpeg", "image/png", "image/webp", "image/gif"];
    if (!allowed.includes(file.type)) {
      return NextResponse.json({ error: "Tip de fișier nesuportat" }, { status: 400 });
    }

    const bytes = await file.arrayBuffer();
    const buf = Buffer.from(bytes);

    // Use MD5 of content as filename (consistent with existing convention)
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
    const hash = crypto.createHash("md5").update(buf).digest("hex");
    const filename = `${hash}.${ext}`;

    const dest = path.join(process.cwd(), "public", "images", "recipes", filename);
    await writeFile(dest, buf);

    return NextResponse.json({ url: `/images/recipes/${filename}` });
  } catch (err) {
    console.error("[upload-image] error:", err);
    return NextResponse.json({ error: "Eroare la upload" }, { status: 500 });
  }
}

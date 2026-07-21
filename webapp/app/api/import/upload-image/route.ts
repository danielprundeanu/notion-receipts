import { NextRequest, NextResponse } from "next/server";
import { writeFile } from "fs/promises";
import path from "path";
import crypto from "crypto";

const ALLOWED = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const EXT: Record<string, string> = {
  "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif",
};

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const file = form.get("file") as File | null;
    if (!file) return NextResponse.json({ error: "Niciun fișier" }, { status: 400 });

    if (!ALLOWED.includes(file.type)) {
      return NextResponse.json({ error: "Tip de fișier nesuportat" }, { status: 400 });
    }
    const MAX_MB = 10;
    if (file.size > MAX_MB * 1024 * 1024) {
      return NextResponse.json({ error: `Imaginea e prea mare (max ${MAX_MB}MB).` }, { status: 400 });
    }

    const buf = Buffer.from(await file.arrayBuffer());
    // MD5 of content as filename (consistent with the existing convention).
    const ext = EXT[file.type] ?? file.name.split(".").pop()?.toLowerCase() ?? "jpg";
    const hash = crypto.createHash("md5").update(buf).digest("hex");
    const filename = `${hash}.${ext}`;

    // Production (Vercel) has a read-only filesystem, so writing to public/ fails.
    // Use Vercel Blob when configured; fall back to the local filesystem in dev
    // (mirrors /api/upload-recipe-image).
    if (process.env.BLOB_READ_WRITE_TOKEN) {
      const { put } = await import("@vercel/blob");
      const blob = await put(`recipes/${filename}`, buf, {
        access: "public",
        contentType: file.type,
        addRandomSuffix: false,
        allowOverwrite: true,
      });
      return NextResponse.json({ url: blob.url });
    }

    const dest = path.join(process.cwd(), "public", "images", "recipes", filename);
    await writeFile(dest, buf);
    return NextResponse.json({ url: `/images/recipes/${filename}` });
  } catch (err) {
    console.error("[import/upload-image] error:", err);
    return NextResponse.json(
      { error: "Nu s-a putut salva imaginea. Pe producție e nevoie de un Vercel Blob store (BLOB_READ_WRITE_TOKEN)." },
      { status: 500 }
    );
  }
}

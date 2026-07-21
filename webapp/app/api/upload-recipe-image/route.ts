import { NextRequest, NextResponse } from "next/server";
import { writeFile } from "fs/promises";
import { join } from "path";
import { createHash } from "crypto";

const ALLOWED_TYPES = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
const MAX_SIZE_MB = 10;
const EXT: Record<string, string> = {
  "image/jpeg": "jpg", "image/jpg": "jpg", "image/png": "png", "image/webp": "webp",
};

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file sent." }, { status: 400 });
    }
    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json({ error: "Format acceptat: JPG, PNG sau WebP." }, { status: 400 });
    }
    if (file.size > MAX_SIZE_MB * 1024 * 1024) {
      return NextResponse.json({ error: `Imaginea e prea mare (max ${MAX_SIZE_MB}MB).` }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const filename = createHash("md5").update(buffer).digest("hex") + "." + (EXT[file.type] ?? "jpg");

    // Production (Vercel) has a read-only filesystem, so writing to public/ fails.
    // Use Vercel Blob when configured; fall back to the local filesystem in dev.
    if (process.env.BLOB_READ_WRITE_TOKEN) {
      const { put } = await import("@vercel/blob");
      const blob = await put(`recipes/${filename}`, buffer, {
        access: "public",
        contentType: file.type,
        addRandomSuffix: false,
        allowOverwrite: true,
      });
      return NextResponse.json({ path: blob.url });
    }

    const dest = join(process.cwd(), "public/images/recipes", filename);
    await writeFile(dest, buffer);
    return NextResponse.json({ path: `/images/recipes/${filename}` });
  } catch (err) {
    console.error("[upload-recipe-image]", err);
    return NextResponse.json(
      { error: "Couldn't save the image. In production a Vercel Blob store is required (BLOB_READ_WRITE_TOKEN)." },
      { status: 500 }
    );
  }
}

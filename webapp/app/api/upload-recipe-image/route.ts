import { NextRequest, NextResponse } from "next/server";
import { writeFile } from "fs/promises";
import { join } from "path";
import { createHash } from "crypto";

const ALLOWED_TYPES = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
const MAX_SIZE_MB = 10;

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const file = formData.get("file") as File | null;

  if (!file) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }
  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json({ error: "Invalid file type. Use JPG, PNG or WebP." }, { status: 400 });
  }
  if (file.size > MAX_SIZE_MB * 1024 * 1024) {
    return NextResponse.json({ error: `File too large (max ${MAX_SIZE_MB}MB)` }, { status: 400 });
  }

  const bytes = await file.arrayBuffer();
  const buffer = Buffer.from(bytes);

  const extMap: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
  };
  const ext = extMap[file.type] ?? "jpg";
  const filename = createHash("md5").update(buffer).digest("hex") + "." + ext;
  const dest = join(process.cwd(), "public/images/recipes", filename);

  await writeFile(dest, buffer);
  return NextResponse.json({ path: `/images/recipes/${filename}` });
}

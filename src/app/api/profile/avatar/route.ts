import { NextResponse } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { getSession, getSessionProfileId } from "@/lib/session";

const AVATARS_DIR = path.join(process.cwd(), "avatars");
const MAX_SIZE = 5 * 1024 * 1024; // 5 MB
const ALLOWED_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

export async function POST(request: Request) {
  const session = await getSession();
  const profileId = getSessionProfileId(session);
  if (!profileId) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const formData = await request.formData();
  const file = formData.get("avatar");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file uploaded." }, { status: 400 });
  }

  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: "File too large. Maximum size is 5 MB." }, { status: 400 });
  }

  const ext = ALLOWED_MIME[file.type];
  if (!ext) {
    return NextResponse.json({ error: "Unsupported file type. Use JPG, PNG, WebP, or GIF." }, { status: 400 });
  }

  await mkdir(AVATARS_DIR, { recursive: true });

  // Remove any existing avatar for this user (different extension)
  const { existsSync, unlinkSync } = await import("fs");
  for (const e of Object.values(ALLOWED_MIME)) {
    const old = path.join(AVATARS_DIR, `${profileId}.${e}`);
    if (existsSync(old)) unlinkSync(old);
  }

  const filePath = path.join(AVATARS_DIR, `${profileId}.${ext}`);
  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(filePath, buffer);

  return NextResponse.json({ ok: true, url: `/api/avatars/${profileId}` });
}

"use client";

import { useEffect, useRef, useState } from "react";
import { Move } from "lucide-react";

interface Props {
  src: string;            // object URL of the selected file
  onSave(blob: Blob): void;
  onCancel(): void;
  saving?: boolean;
}

const CROP_SIZE = 200; // px — size of the interactive circle
const OUTPUT_SIZE = 512; // px — final saved image

export function AvatarCropper({ src, onSave, onCancel, saving }: Props) {
  const imgRef     = useRef<HTMLImageElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Position of the image's top-left corner relative to the container
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [imgDisplaySize, setImgDisplaySize] = useState({ w: 0, h: 0 });
  const dragRef = useRef<{ startX: number; startY: number; posX: number; posY: number } | null>(null);

  // When image loads, centre it inside the circle
  function handleLoad() {
    const img = imgRef.current;
    if (!img) return;
    const nat = img.naturalWidth / img.naturalHeight;
    let w: number, h: number;
    if (nat >= 1) {
      // wider than tall — match height to CROP_SIZE, width larger
      h = CROP_SIZE;
      w = h * nat;
    } else {
      w = CROP_SIZE;
      h = w / nat;
    }
    setImgDisplaySize({ w, h });
    setPos({ x: (CROP_SIZE - w) / 2, y: (CROP_SIZE - h) / 2 });
  }

  // Clamp so the circle always stays covered
  function clamp(p: { x: number; y: number }, w: number, h: number) {
    return {
      x: Math.min(0, Math.max(CROP_SIZE - w, p.x)),
      y: Math.min(0, Math.max(CROP_SIZE - h, p.y)),
    };
  }

  function onMouseDown(e: React.MouseEvent) {
    dragRef.current = { startX: e.clientX, startY: e.clientY, posX: pos.x, posY: pos.y };
    e.preventDefault();
  }

  function onMouseMove(e: React.MouseEvent) {
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    setPos(clamp(
      { x: dragRef.current.posX + dx, y: dragRef.current.posY + dy },
      imgDisplaySize.w, imgDisplaySize.h,
    ));
  }

  function onMouseUp() { dragRef.current = null; }

  // Touch equivalents
  function onTouchStart(e: React.TouchEvent) {
    const t = e.touches[0];
    dragRef.current = { startX: t.clientX, startY: t.clientY, posX: pos.x, posY: pos.y };
  }
  function onTouchMove(e: React.TouchEvent) {
    if (!dragRef.current) return;
    const t = e.touches[0];
    const dx = t.clientX - dragRef.current.startX;
    const dy = t.clientY - dragRef.current.startY;
    setPos(clamp(
      { x: dragRef.current.posX + dx, y: dragRef.current.posY + dy },
      imgDisplaySize.w, imgDisplaySize.h,
    ));
    e.preventDefault();
  }

  function handleSave() {
    const img = imgRef.current;
    if (!img) return;

    // Scale from display pixels to natural pixels
    const scaleX = img.naturalWidth  / imgDisplaySize.w;
    const scaleY = img.naturalHeight / imgDisplaySize.h;

    // Visible rectangle in image-natural coordinates
    const srcX =  -pos.x * scaleX;
    const srcY =  -pos.y * scaleY;
    const srcW = CROP_SIZE * scaleX;
    const srcH = CROP_SIZE * scaleY;

    const canvas = document.createElement("canvas");
    canvas.width  = OUTPUT_SIZE;
    canvas.height = OUTPUT_SIZE;
    const ctx = canvas.getContext("2d")!;

    // Clip to circle
    ctx.beginPath();
    ctx.arc(OUTPUT_SIZE / 2, OUTPUT_SIZE / 2, OUTPUT_SIZE / 2, 0, Math.PI * 2);
    ctx.clip();

    ctx.drawImage(img, srcX, srcY, srcW, srcH, 0, 0, OUTPUT_SIZE, OUTPUT_SIZE);

    canvas.toBlob((blob) => {
      if (blob) onSave(blob);
    }, "image/jpeg", 0.92);
  }

  return (
    <div className="avatar-cropper-wrap">
      <p className="avatar-cropper-hint">
        <Move size={13} /> Drag to centre your photo
      </p>

      {/* Circle crop area */}
      <div
        ref={containerRef}
        className="avatar-cropper-circle"
        style={{ width: CROP_SIZE, height: CROP_SIZE }}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onMouseUp}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          ref={imgRef}
          src={src}
          alt="Crop preview"
          className="avatar-cropper-img"
          style={{
            width:  imgDisplaySize.w || "auto",
            height: imgDisplaySize.h || "auto",
            transform: `translate(${pos.x}px, ${pos.y}px)`,
          }}
          onLoad={handleLoad}
          draggable={false}
        />
      </div>

      <div className="avatar-cropper-actions">
        <button className="button primary" type="button" onClick={handleSave} disabled={saving || imgDisplaySize.w === 0}>
          {saving ? "Saving…" : "Save Photo"}
        </button>
        <button className="button secondary" type="button" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

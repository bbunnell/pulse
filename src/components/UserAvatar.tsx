"use client";

import { useEffect, useState } from "react";

interface Props {
  userId: string;
  firstName: string;
  lastName: string;
  className?: string;
  style?: React.CSSProperties;
  version?: number;
}

function initials(firstName: string, lastName: string) {
  return `${firstName[0] ?? ""}${lastName[0] ?? ""}`.toUpperCase();
}

export function UserAvatar({ userId, firstName, lastName, className = "avatar", style, version = 0 }: Props) {
  const [photoSrc, setPhotoSrc] = useState<string | null>(null);
  const text = initials(firstName, lastName);

  useEffect(() => {
    const url = `/api/avatars/${userId}${version ? `?v=${version}` : ""}`;
    const img = new window.Image();
    img.onload = () => setPhotoSrc(url);
    img.onerror = () => setPhotoSrc(null);
    img.src = url;
  }, [userId, version]);

  if (!photoSrc) {
    return (
      <span className={className} style={style}>
        {text}
      </span>
    );
  }

  return (
    <span className={className} style={{ padding: 0, overflow: "hidden", borderRadius: "50%", flexShrink: 0, ...style }}>
      <img
        src={photoSrc}
        alt={text}
        style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
      />
    </span>
  );
}

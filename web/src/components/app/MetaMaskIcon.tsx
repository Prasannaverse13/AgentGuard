"use client";

import { useEffect, useState } from "react";
import { findMetaMask } from "@/lib/wallet/metamask";

/** The icon MetaMask itself announces (EIP-6963). Nothing is drawn by us. */
export function MetaMaskIcon({ size = 20 }: { size?: number }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    void findMetaMask(1000).then((m) => {
      if (m?.info.icon.startsWith("data:image/")) setSrc(m.info.icon);
    });
  }, []);
  if (!src) return null;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt="" width={size} height={size} style={{ flex: "none" }} />;
}

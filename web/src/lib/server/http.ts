import { NextResponse } from "next/server";
import { VaultError } from "../vault/engine";

export const ok = (data: unknown) => NextResponse.json(data);

export function fail(e: unknown) {
  const msg = e instanceof Error ? e.message : "Something went wrong";
  const status = e instanceof VaultError || (e instanceof Error && /No (amount|payee)|Bad amount|Cannot pay/.test(msg)) ? 400 : 500;
  return NextResponse.json({ error: msg }, { status });
}

import { recoverMessageAddress, type Hex } from "viem";

/** Who signed this text with personal_sign. Lower case 0x address, or null. */
export async function signerOf(text: string, signature: string): Promise<string | null> {
  if (!/^0x[0-9a-fA-F]{130}$/.test(signature)) return null;
  try {
    return (await recoverMessageAddress({ message: text, signature: signature as Hex })).toLowerCase();
  } catch {
    return null;
  }
}

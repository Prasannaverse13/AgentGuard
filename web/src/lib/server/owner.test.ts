import assert from "node:assert/strict";
import { test } from "node:test";
import { privateKeyToAccount } from "viem/accounts";
import { claimMessage, ownerMessage, type OwnerAction } from "../owner/actions";
import { signerOf } from "./verify";
import { resetVault } from "./store";

process.env.VAULT_DATA_FILE = "/tmp/agentguard-owner-test.json";
const owner = privateKeyToAccount("0x0123456789012345678901234567890123456789012345678901234567890123");
const other = privateKeyToAccount("0x1111111111111111111111111111111111111111111111111111111111111111");

test("a personal_sign signature recovers the signer", async () => {
  const sig = await owner.signMessage({ message: claimMessage("demo.agentguard", owner.address) });
  assert.equal(await signerOf(claimMessage("demo.agentguard", owner.address), sig), owner.address.toLowerCase());
});

test("a wrong or broken signature gives null or another address", async () => {
  const sig = await other.signMessage({ message: "x" });
  assert.notEqual(await signerOf("x", sig), owner.address.toLowerCase());
  assert.equal(await signerOf("x", "0x1234"), null);
});

test("the signed message binds the vault, the nonce and the action", async () => {
  const v = resetVault();
  v.state.ownerEth = owner.address.toLowerCase();
  const action: OwnerAction = { method: "set_paused", args: { paused: true } };
  const text = JSON.stringify(action);
  const sig = await owner.signMessage({ message: ownerMessage(v.state.vaultId, v.state.ownerNonce, text) });
  assert.equal(await signerOf(ownerMessage(v.state.vaultId, 0, text), sig), v.state.ownerEth);
  assert.notEqual(await signerOf(ownerMessage(v.state.vaultId, 1, text), sig), v.state.ownerEth);
  assert.notEqual(await signerOf(ownerMessage("other.near", 0, text), sig), v.state.ownerEth);
  await v.applyOwner(action);
  assert.equal(v.state.paused, true);
});

test("the message format matches the contract", () => {
  assert.equal(
    ownerMessage("vault.near", 4, '{"method":"set_paused","args":{"paused":true}}'),
    'AgentGuard owner action\nvault: vault.near\nnonce: 4\naction: {"method":"set_paused","args":{"paused":true}}',
  );
});

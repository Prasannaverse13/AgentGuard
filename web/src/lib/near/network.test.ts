import assert from "node:assert/strict";
import { test } from "node:test";
import { isAccountId, resolve, rpcFor, serverNetwork, vaultFor } from "./network";

test("testnet is the default network", () => {
  assert.equal(serverNetwork({}), "testnet");
  assert.equal(serverNetwork({ NEAR_NETWORK: "mainnet" }), "mainnet");
  assert.equal(serverNetwork({ NEAR_NETWORK: "junk" }), "testnet");
});

test("rpc falls back to a public node and honours overrides", () => {
  assert.match(rpcFor("testnet", {}), /^https:\/\/test\./);
  assert.match(rpcFor("mainnet", {}), /^https:\/\//);
  assert.equal(rpcFor("testnet", { NEAR_RPC_URL: "http://x" }), "http://x");
  assert.equal(rpcFor("mainnet", { NEAR_RPC_URL: "http://x" }), rpcFor("mainnet", {}));
  assert.equal(rpcFor("mainnet", { NEAR_MAINNET_RPC_URL: "http://m" }), "http://m");
});

test("vault from env belongs to the server network only", () => {
  const env = { NEAR_NETWORK: "testnet", NEAR_VAULT_ID: "v.testnet" };
  assert.equal(vaultFor("testnet", env), "v.testnet");
  assert.equal(vaultFor("mainnet", env), null);
  assert.equal(vaultFor("mainnet", { NEAR_MAINNET_VAULT_ID: "v.near" }), "v.near");
});

test("a vault typed in the browser is read only", () => {
  const env = { NEAR_VAULT_ID: "v.testnet" };
  assert.equal(resolve("testnet", null, env).writable, true);
  assert.equal(resolve("testnet", "v.testnet", env).writable, true);
  assert.equal(resolve("testnet", "other.testnet", env).writable, false);
  assert.equal(resolve("mainnet", null, env).vault, null);
  assert.equal(resolve("testnet", null, {}).writable, false);
});

test("account ids are checked", () => {
  assert.ok(isAccountId("agentguard.alice.testnet"));
  assert.ok(isAccountId("a-b_c.near"));
  assert.ok(!isAccountId("Bad.near"));
  assert.ok(!isAccountId("a"));
  assert.ok(!isAccountId("x".repeat(65)));
  assert.ok(!isAccountId("a..b"));
  assert.ok(!isAccountId("ab.near/../x"));
});

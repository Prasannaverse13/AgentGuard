# Submission text

## Name
AgentGuard

## One line
AI agents run a small business's money on NEAR, but only inside the owner's rules.

## Description
Small businesses cannot trust an AI agent with a bank card. AgentGuard gives them a NEAR vault instead.
Agents ask the vault to pay. The vault checks the owner's limits, token list and payee list on chain.
A scam check scores every payment. Anything over a limit waits in a queue for the owner.
Every action is logged with the agent's reason.

Safety goes further: an agent that keeps getting stopped is paused automatically, large payments need two approvers,
payees can be private through NEAR Intents, and the owner gets Telegram or email alerts. Owner approvals are MetaMask
signatures checked on chain, so a relayer can never forge one.

Live on NEAR testnet: agentguard.prasanna-ag.testnet. Ops paid for API calls on chain, Payables held and paid a new payee,
a lookalike payee was dismissed, Revenue split income by rule.

Three agents work inside it. Payables reads invoices and pays them, across chains through NEAR Intents.
Ops buys data and APIs one call at a time with HTTP 402 pay per call.
Revenue splits income by the owner's rules and cannot choose who gets paid.

## Tracks
AI Security and Defense. Agent Economy. Autonomous Business. Real World Money. Also relevant: AI Swarms and Privacy.

## X post
Small businesses cannot hand an AI agent a bank card.
So we built AgentGuard on NEAR: agents pay invoices, buy data and split revenue, but only inside your rules.
Big or odd payments wait for you. Scams get blocked. Every action is on chain with a reason.
Built for the NEAR Hackathon. [repo] [video]

## Demo video script (about 2 minutes)
1. Landing page. Say the problem in one sentence. (10s)
2. Dashboard overview. Show the vault balance and three agents. (10s)
3. Payables: pay the normal invoice. It is paid. Open Activity and show the reason. (20s)
4. Payables: run the scam invoice. It is blocked. Show the flags. (20s)
5. Payables: run the large invoice. It waits in Approvals. Approve it. (20s)
6. Ops: buy 5 data calls. Show the 402 pay loop in Activity. (20s)
7. Revenue: split 1,200 USDC. Show three payments. (15s)
8. Rules: pause the vault. Run an agent. Show it refused. (15s)
9. Show the contract tests passing. Close. (10s)

## What you must do yourself
- Create a public GitHub repo and push this folder.
- Move ci/contract.yml to .github/workflows/contract.yml. Never commit web/.env.
- Optional: deploy the web app (Vercel) in Demo mode so judges can click without keys.
- Submit your NEAR wallet: prasanna-ag.testnet (use a mainnet wallet if the form asks for one).
- Record the video. Post on X. Submit the form before Nov 14 2026 23:59 UTC.

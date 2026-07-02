# Privacy Policy

_Last updated: 2026-07-01_

**whoop-mcp** is an open-source, **self-hosted** application that lets its operator
access **their own** WHOOP data through WHOOP's official API and use it with an
AI assistant (such as Claude) via the Model Context Protocol (MCP). Each
deployment is operated privately by the individual who set it up ("the
operator"), using their own WHOOP developer credentials. There is no shared or
central service.

## What data is accessed

With the operator's authorization (WHOOP OAuth), the app may read the WHOOP data
covered by the granted scopes, which can include: recovery, sleep, physiological
cycles, workouts, basic profile, and body measurements.

## How data is used

Data is retrieved **on demand** to answer the operator's own requests through
their connected AI assistant. It is **not sold**, and it is **not shared** with
any third party other than:

- **WHOOP** — the source of the data; and
- **the AI assistant / MCP client the operator connects** (e.g. Anthropic's
  Claude), which receives the requested data solely to fulfill the operator's
  own queries.

## Storage and retention

- **WHOOP OAuth tokens** (access and refresh tokens) are stored only in storage
  the operator controls — a local file or the operator's own Redis instance —
  and are used to call the WHOOP API on the operator's behalf. They are retained
  until the operator revokes access or deletes them.
- **WHOOP health/activity data** is fetched per request and returned to the
  operator's AI assistant; the app does **not** maintain its own database of this
  data.

## Revoking access

The operator can revoke this app's access at any time from the WHOOP account /
developer dashboard, and can delete stored tokens from their own storage. Doing
so stops all further data access.

## Security

Access to the deployed server is protected by an operator-set bearer key.
WHOOP credentials are never exposed to the AI assistant; only the operator's own
server communicates with WHOOP.

## Contact

Questions or requests can be raised via the project repository:
<https://github.com/swapnilbhalgat/whoop-mcp/issues>

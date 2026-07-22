# Estonian Law MCP Server

<!-- ANSVAR-CTA-BEGIN -->
> **The Estonian law corpus is now served through the Ansvar Gateway.** Connect your AI assistant (Claude, Copilot, Cursor, custom MCP client) to `https://gateway.ansvar.eu/mcp` — one OAuth connection, free tier available, covering this corpus plus EU regulations, national law across dozens of audited jurisdictions (Europe + the US), and CVE/security intelligence, every result with a verbatim source citation. Start at https://ansvar.eu/docs/quickstart

### Connect

**Claude Code** (one line):

```bash
claude mcp add ansvar --transport http https://gateway.ansvar.eu/mcp
```

**Claude Desktop / Cursor** — add to `claude_desktop_config.json` (or `mcp.json`):

```json
{
  "mcpServers": {
    "ansvar": {
      "type": "url",
      "url": "https://gateway.ansvar.eu/mcp"
    }
  }
}
```

**Claude.ai** — Settings → Connectors → Add custom connector → paste `https://gateway.ansvar.eu/mcp`

First request opens an OAuth signup flow (setup details: [ansvar.eu/docs/quickstart](https://ansvar.eu/docs/quickstart)). After signup, your client is bound to your account; tier (free / premium / team / company) determines fan-out, quota, and which downstream MCPs are reachable.

---

## Self-host this MCP

You can also clone this repo and build the corpus yourself. The schema,
fetcher, and tool implementations all live here. What is not in the repo is
the pre-built database — TDM and standards-licensing constraints on the
upstream sources mean we host the corpus on Ansvar infrastructure rather
than redistribute it as a public artifact.

Build your own: run this repo's ingestion script (entry-point varies per
repo — typically `scripts/ingest.sh`, `npm run ingest`, or `make ingest`;
check the repo root).
<!-- ANSVAR-CTA-END -->


**The Riigi Teataja alternative for the AI age.**

[![MCP Registry](https://img.shields.io/badge/MCP-Registry-blue)](https://registry.modelcontextprotocol.io)
[![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![GitHub stars](https://img.shields.io/github/stars/Ansvar-Systems/Estonian-law-mcp?style=social)](https://github.com/Ansvar-Systems/Estonian-law-mcp)
[![CI](https://github.com/Ansvar-Systems/Estonian-law-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/Ansvar-Systems/Estonian-law-mcp/actions/workflows/ci.yml)
[![Daily Data Check](https://github.com/Ansvar-Systems/Estonian-law-mcp/actions/workflows/check-updates.yml/badge.svg)](https://github.com/Ansvar-Systems/Estonian-law-mcp/actions/workflows/check-updates.yml)
[![Database](https://img.shields.io/badge/database-pre--built-green)](docs/EU_INTEGRATION_GUIDE.md)
[![Provisions](https://img.shields.io/badge/provisions-63%2C652-blue)](docs/EU_INTEGRATION_GUIDE.md)

Query **1,602 Estonian statutes** — from the Isikuandmete kaitse seadus (IKS) and the Karistusseadustik to the Tsiviilseadustiku üldosa seadus, Küberturvalisuse seadus, and more — directly from Claude, Cursor, or any MCP-compatible client.

If you're building legal tech, compliance tools, or doing Estonian legal research, this is your verified reference database.

Built by [Ansvar Systems](https://ansvar.eu) -- Stockholm, Sweden

---

## Why This Exists

Estonian legal research is concentrated in the Riigi Teataja — Estonia's model e-governance platform — but navigating 1,602 seadused across Estonian and cross-referencing with EUR-Lex remains manual work. Whether you're:
- A **lawyer** validating citations in a brief or leping
- A **compliance officer** checking obligations under IKS or the Küberturvalisuse seadus
- A **legal tech developer** building tools on Estonian law
- A **researcher** tracing legislative history from eelnõu to seadus

...you shouldn't need a dozen browser tabs and manual cross-referencing. Ask Claude. Get the exact provision. With context.

This MCP server makes Estonian law **searchable, cross-referenceable, and AI-readable**.

---

## Example Queries

Once connected, just ask naturally (päringud toimivad eesti keeles või inglise keeles):

- *"Mida ütleb isikuandmete kaitse seaduse (IKS) § 6 isikuandmete töötlemise põhimõtete kohta?"*
- *"Otsida 'isikuandmete kaitse' Eesti õigusaktidest"*
- *"Kas isikuandmete kaitse seadus (RT I, 04.01.2019, 11) on endiselt jõus?"*
- *"Millised on Karistusseadustiku sätted arvutikuritegude kohta?"*
- *"Millised Eesti seadused rakendavad NIS2 direktiivi?"*
- *"Otsida e-allkirja sätteid elektroonilise identimise ja e-tehingute usaldusteenuste seadusest"*
- *"Find provisions about data breach notification in Estonian law"*
- *"Validate the citation 'IKS § 6'"*

---

## What's Included

| Category | Count | Details |
|----------|-------|---------|
| **Statutes** | 1,602 seadust | Comprehensive Estonian legislation from Riigi Teataja |
| **Provisions** | 63,624 paragrahvi | Full-text searchable with FTS5 |
| **Premium: Case law** | 0 (free tier) | Riigikohus and circuit court decisions planned |
| **Premium: Preparatory works** | 163,383 documents | Seaduseelnõud and seletuskirjad |
| **Premium: Agency guidance** | 0 (free tier) | Andmekaitse Inspektsioon guidance planned |
| **Database Size** | ~116 MB | Optimized SQLite, portable |
| **Daily Updates** | Automated | Freshness checks against Riigi Teataja |

**Verified data only** — every citation is validated against official sources (riigiteataja.ee). Zero LLM-generated content.

---

## Why This Works

**Verbatim Source Text (No LLM Processing):**
- All statute text is ingested from Riigi Teataja (riigiteataja.ee) official sources
- Provisions are returned **unchanged** from SQLite FTS5 database rows
- Zero LLM summarization or paraphrasing — the database contains regulation text, not AI interpretations

**Smart Context Management:**
- Search returns ranked provisions with BM25 scoring (safe for context)
- Provision retrieval gives exact text by seadus abbreviation + paragraph number
- Cross-references help navigate without loading everything at once

**Technical Architecture:**
```
Riigi Teataja API → Parse → SQLite → FTS5 snippet() → MCP response
                      ↑                     ↑
               Provision parser       Verbatim database query
```

### Traditional Research vs. This MCP

| Traditional Approach | This MCP Server |
|---------------------|-----------------|
| Search Riigi Teataja by seaduse nimetus | Search by plain Estonian: *"isikuandmete töötlemine nõusolek"* |
| Navigate multi-chapter seadused manually | Get the exact provision with context |
| Manual cross-referencing between seadused | `build_legal_stance` aggregates across sources |
| "Kas see seadus on jõus?" → check manually | `check_currency` tool → answer in seconds |
| Find EU basis → dig through EUR-Lex | `get_eu_basis` → linked EU directives instantly |
| No API, no integration | MCP protocol → AI-native |

**Traditional:** Search Riigi Teataja → Download PDF → Ctrl+F → Cross-reference with EUR-Lex → Check AKI guidance → Repeat

**This MCP:** *"Mis on IKS § 6 Euroopa õiguslik alus isikuandmete töötlemise põhimõtete kohta?"* → Done.

---

## Available Tools (13)

### Core Legal Research Tools (8)

| Tool | Description |
|------|-------------|
| `search_legislation` | FTS5 full-text search across 63,624 paragrahvi with BM25 ranking. Supports quoted phrases, boolean operators, prefix wildcards |
| `get_provision` | Retrieve specific provision by seadus abbreviation + paragraph (e.g., "IKS" + "§ 6") |
| `check_currency` | Check if a statute is in force (jõus/kehtetud), amended, or repealed |
| `validate_citation` | Validate citation against database — zero-hallucination check. Supports "IKS § 6", "KarS § 206" |
| `build_legal_stance` | Aggregate citations from multiple seadused for a legal topic |
| `format_citation` | Format citations per Estonian conventions (full/short/pinpoint) |
| `list_sources` | List all available statutes with metadata, coverage scope, and data provenance |
| `about` | Server info, capabilities, dataset statistics, and coverage summary |

### EU Law Integration Tools (5)

| Tool | Description |
|------|-------------|
| `get_eu_basis` | Get EU directives/regulations underlying an Estonian statute |
| `get_estonian_implementations` | Find Estonian laws implementing a specific EU act |
| `search_eu_implementations` | Search EU documents with Estonian implementation counts |
| `get_provision_eu_basis` | Get EU law references for a specific provision |
| `validate_eu_compliance` | Check implementation status of Estonian statutes against EU directives |

---

## EU Law Integration

Estonia is an **EU member state** (since 2004) and a digital governance pioneer. Estonian e-governance and digital identity legislation directly shaped EU instruments like eIDAS, making Estonia unique as both an implementer and an originator of EU digital law.

| Metric | Value |
|--------|-------|
| **EU Member State** | Yes — since 1 May 2004 |
| **Eurozone** | Yes — since 1 January 2011 |
| **EU References** | Cross-references linking Estonian statutes to EU law |
| **Directives transposed** | GDPR, NIS2, DORA, eIDAS, AI Act, PSD2, AML directives, and more |
| **EUR-Lex Integration** | Automated metadata fetching |
| **e-Governance** | Estonian digital ID legislation helped define eIDAS standards |

### Key Estonian EU Implementations

- **Isikuandmete kaitse seadus (IKS)** — GDPR national implementation (isikuandmete kaitse)
- **Küberturvalisuse seadus** — Cybersecurity Act (NIS Directive transposition)
- **E-identimise ja e-tehingute usaldusteenuste seadus** — eIDAS transposition
- **Makseasutuste ja e-raha asutuste seadus** — PSD2 transposition

See [EU_INTEGRATION_GUIDE.md](docs/EU_INTEGRATION_GUIDE.md) for detailed documentation.

---

## Data Sources & Freshness

All content is sourced from authoritative Estonian legal databases:

- **[Riigi Teataja](https://www.riigiteataja.ee/)** — Official State Gazette of Estonia (Eesti ametlik väljaanne)
- **[EUR-Lex](https://eur-lex.europa.eu/)** — Official EU law database (metadata only)

### Data Provenance

| Field | Value |
|-------|-------|
| **Authority** | Riigi Teataja (Estonian State Gazette) |
| **Retrieval method** | Riigi Teataja official open data API |
| **Language** | Estonian |
| **License** | Public domain (avalik teave) |
| **Coverage** | 1,602 statutes, 63,624 provisions |
| **Last ingested** | 2026-02-28 |

### Automated Freshness Checks (Daily)

A [daily GitHub Actions workflow](.github/workflows/check-updates.yml) monitors Riigi Teataja for changes:

| Check | Method |
|-------|--------|
| **Statute amendments** | Riigi Teataja date comparison across 1,602 statutes |
| **New statutes** | Riigi Teataja new publication monitoring |
| **Repealed statutes** | Kehtetud/jõus status change detection |
| **EU reference staleness** | Git commit timestamps — flagged if >90 days old |

**Verified data only** — every citation is validated against official sources. Zero LLM-generated content.

---

## Security

This project uses multiple layers of automated security scanning:

| Scanner | What It Does | Schedule |
|---------|-------------|----------|
| **CodeQL** | Static analysis for security vulnerabilities | Weekly + PRs |
| **Semgrep** | SAST scanning (OWASP top 10, secrets, TypeScript) | Every push |
| **Gitleaks** | Secret detection across git history | Every push |
| **Trivy** | CVE scanning on filesystem and npm dependencies | Daily |
| **Docker Security** | Container image scanning + SBOM generation | Daily |
| **Socket.dev** | Supply chain attack detection | PRs |
| **OSSF Scorecard** | OpenSSF best practices scoring | Weekly |
| **Dependabot** | Automated dependency updates | Weekly |

See [SECURITY.md](SECURITY.md) for the full policy and vulnerability reporting.

---

## Important Disclaimers

### Legal Advice

> **THIS TOOL IS NOT LEGAL ADVICE**
>
> Statute text is sourced from official Riigi Teataja publications. However:
> - This is a **research tool**, not a substitute for professional legal counsel
> - **Court case coverage is not included** in the free tier — do not rely solely on this for kohtupraktika research
> - **Verify critical citations** against primary sources (Riigi Teataja) for court filings
> - **EU cross-references** are extracted from statute text and EUR-Lex metadata, not a complete implementation mapping

**Before using professionally, read:** [DISCLAIMER.md](DISCLAIMER.md) | [PRIVACY.md](PRIVACY.md)

### Client Confidentiality

Queries go through the Claude API. For privileged or confidential matters, use on-premise deployment. See [PRIVACY.md](PRIVACY.md) for guidance consistent with **Eesti Advokatuur** (Estonian Bar Association) professional conduct standards.

---

## Development

### Setup

```bash
git clone https://github.com/Ansvar-Systems/Estonian-law-mcp
cd Estonian-law-mcp
npm install
npm run build
npm test
```

### Running Locally

```bash
npm run dev                                       # Start MCP server
npx @anthropic/mcp-inspector node dist/index.js   # Test with MCP Inspector
```

### Data Management

```bash
npm run ingest           # Ingest seadused from Riigi Teataja
npm run build:db         # Rebuild SQLite database
npm run drift:detect     # Run drift detection against anchors
npm run check-updates    # Check for amendments
```

### Performance

- **Search Speed:** <100ms for most FTS5 queries
- **Database Size:** ~116 MB (efficient, portable)
- **Reliability:** 100% ingestion success rate

---

## More Ansvar MCPs

Full fleet coverage at [ansvar.eu/coverage](https://ansvar.eu/coverage).
## Contributing

Contributions welcome! See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

Priority areas:
- Court case law expansion (Riigikohus, ringkonnakohtud)
- EU cross-reference expansion
- Historical statute versions and amendment tracking
- Andmekaitse Inspektsioon guidance documents
- RIA (Riigi Infosüsteemi Amet) cybersecurity guidance

---

## Roadmap

- [x] Core statute database with FTS5 search (1,602 statutes, 63,624 provisions)
- [x] EU law integration with bi-directional lookup
- [x] Premium preparatory works dataset (163,383 documents)
- [x] Vercel Streamable HTTP deployment

- [ ] Kohtupraktika (court case law) expansion — Riigikohus and ringkonnakohtud
- [ ] Historical statute versions (amendment tracking)
- [ ] Andmekaitse Inspektsioon guidance documents
- [ ] RIA cybersecurity guidance and notices

---

## Citation

If you use this MCP server in academic research:

```bibtex
@software{estonian_law_mcp_2026,
  author = {Ansvar Systems AB},
  title = {Estonian Law MCP Server: AI-Powered Legal Research Tool},
  year = {2026},
  url = {https://github.com/Ansvar-Systems/Estonian-law-mcp},
  note = {1,602 Estonian statutes with 63,624 provisions and EU law cross-references}
}
```

---

## License

Apache License 2.0. See [LICENSE](./LICENSE) for details.

### Data Licenses

- **Statutes & Legislation:** Riigi Teataja (public domain — avalik teave)
- **EU Metadata:** EUR-Lex (EU public domain)

---

## About Ansvar Systems

We build AI-accelerated compliance and legal research tools for the European market. Estonia's leadership in digital governance — from e-residency to blockchain-secured public records — makes it a natural fit for our AI-native legal research tools.

So we're open-sourcing it. Navigating 1,602 seadused and 63,624 provisions shouldn't require a law degree.

**[ansvar.eu](https://ansvar.eu)** -- Stockholm, Sweden

---

<p align="center">
  <sub>Built with care in Stockholm, Sweden</sub>
</p>

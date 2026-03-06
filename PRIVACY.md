# Privacy & Client Confidentiality

**IMPORTANT READING FOR LEGAL PROFESSIONALS**

This document addresses privacy and confidentiality considerations when using this Tool, with particular attention to professional obligations under Estonian bar association rules.

---

## Executive Summary

**Key Risks:**
- Queries through Claude API flow via Anthropic cloud infrastructure
- Query content may reveal client matters and privileged information
- Estonian Bar Association rules (Eesti Advokatuur, advokatuur.ee) require strict confidentiality (saladuse hoidmise kohustus) under Advokatuuriseadus § 43

**Safe Use Options:**
1. **General Legal Research**: Use Tool for non-client-specific queries
2. **Local npm Package**: Install `@ansvar/estonian-law-mcp` locally — database queries stay on your machine
3. **Remote Endpoint**: Vercel Streamable HTTP endpoint — queries transit Vercel infrastructure
4. **On-Premise Deployment**: Self-host with local LLM for privileged matters

---

## Data Flows and Infrastructure

### MCP (Model Context Protocol) Architecture

This Tool uses the **Model Context Protocol (MCP)** to communicate with AI clients:

```
User Query -> MCP Client (Claude Desktop/Cursor/API) -> Anthropic Cloud -> MCP Server -> Database
```

### Deployment Options

#### 1. Local npm Package (Most Private)

```bash
npx @ansvar/estonian-law-mcp
```

- Database is local SQLite file on your machine
- No data transmitted to external servers (except to AI client for LLM processing)
- Full control over data at rest
- Recommended for: general research, solo practitioners, matters involving any client context

#### 2. Remote Endpoint (Vercel)

```
Endpoint: https://estonian-law-mcp.vercel.app/mcp
```

- Queries transit Vercel infrastructure (Vercel, Inc., USA)
- Tool responses return through the same path
- Subject to Vercel's privacy policy
- Acceptable for: fully anonymized, non-client-specific legal research only

#### 3. On-Premise Deployment (Most Secure)

```bash
docker run -e DATABASE_PATH=/data/estonian-law.db ansvar/estonian-law-mcp
```

- Full control: no data leaves your infrastructure
- Pair with a self-hosted LLM (e.g., Ollama) to eliminate all external data flows
- Required for: classified matters, government use (ISKE-classified environments), matters where saladuse hoidmise kohustus mandates no external processing

### What Gets Transmitted

When you use this Tool through an AI client:

- **Query Text**: Your search queries and tool parameters
- **Tool Responses**: Statute text (õigusnormide tekstid), provision content, search results
- **Metadata**: Timestamps, request identifiers

**What Does NOT Get Transmitted:**
- Files on your computer
- Your full conversation history (depends on AI client configuration)

---

## Professional Obligations (Estonia)

### Estonian Bar Association Rules

Estonian lawyers (vandeadvokaadid) are bound by strict confidentiality rules under the **Advokatuuriseadus** and the **advokaadi eetikakoodeks**, enforced by the Eesti Advokatuur (advokatuur.ee). Disciplinary matters are handled by the Advokatuuri aukohtud.

#### Saladuse Hoidmise Kohustus (Duty of Confidentiality) — Advokatuuriseadus § 43

- All client communications are privileged under Advokatuuriseadus § 43
- The duty applies without time limit and covers all information learned in the course of representation
- Client identity may be confidential in sensitive matters
- Case strategy, legal analysis, and factual instructions are protected
- Information that could identify clients or matters must be safeguarded even in anonymized queries
- Breach of confidentiality may result in disciplinary proceedings (distsiplinaarmenetlus) before the Advokatuuri aukohtud

### Estonian Personal Data Protection Act (IKS) and GDPR

Under **GDPR Article 28** and the **Isikuandmete kaitse seadus (IKS)** — Estonia's GDPR implementation act — when using services that process client data:

- You are the **Data Controller** (vastutav töötleja) under GDPR Article 4(7)
- AI service providers (Anthropic, Vercel) may be **Data Processors** (volitatud töötleja) under GDPR Article 4(8)
- A **Data Processing Agreement** (andmetöötlusleping) under GDPR Article 28 may be required before transmitting any personal data
- Ensure adequate technical and organizational measures (tehnilised ja korralduslikud meetmed, TOM-id) are in place
- The **Andmekaitse Inspektsioon (AKI, aki.ee)** is the supervisory authority for Estonian GDPR and IKS compliance; AKI handles complaints, investigations, and enforcement

### IKS — Specific Estonian Provisions

The Isikuandmete kaitse seadus supplements GDPR with Estonian-specific rules including:

- Provisions on processing personal data in employment relationships
- Rules on processing by public authorities and state databases (integrated with X-tee / X-Road)
- Age of consent provisions for information society services
- Specific obligations for health data processing

Advokaadid processing client personal data must comply with both GDPR and the IKS. When in doubt, consult AKI guidance at aki.ee, including their published juhendid (guidelines) for legal professionals.

---

## Risk Assessment by Use Case

### LOW RISK: General Legal Research

**Safe to use through any deployment:**

```
Example: "What does § 101 of the Võlaõigusseadus (VÕS) say about damages?"
```

- No client identity involved
- No case-specific facts
- Publicly available legal information

### MEDIUM RISK: Anonymized Queries

**Use with caution:**

```
Example: "What are the penalties for fraud under the Estonian Karistusseadustik (KarS)?"
```

- Query pattern may reveal you are working on a fraud matter
- Anthropic/Vercel logs may link queries to your API key
- Consider using local npm package even for anonymized queries involving sensitive practice areas

### HIGH RISK: Client-Specific Queries

**DO NOT USE through cloud AI services:**

- Remove ALL identifying details before using any cloud deployment
- Use the local npm package with a self-hosted LLM
- Or use Riigi Teataja and professional resources with proper andmetöötluslepingud
- Queries containing client names, isikukoodid (personal identification numbers), company registry codes, or case references are HIGH RISK even if you consider them anonymized

---

## Data Collection by This Tool

### What This Tool Collects

**Nothing.** This Tool:

- Does NOT log queries
- Does NOT store user data
- Does NOT track usage
- Does NOT use analytics
- Does NOT set cookies

The database is read-only. No user data is written to disk.

### What Third Parties May Collect

- **Anthropic** (if using Claude): Subject to [Anthropic Privacy Policy](https://www.anthropic.com/legal/privacy)
- **Vercel** (if using remote endpoint): Subject to [Vercel Privacy Policy](https://vercel.com/legal/privacy-policy)

---

## Recommendations

### For Solo Practitioners / Small Firms (Üksikadvokaadid / Väikesed bürood)

1. Use local npm package for maximum privacy
2. General research: Cloud AI is acceptable for fully non-client-specific queries
3. Client matters: Use official riigiteataja.ee and Juura/JURIDICA resources with proper andmetöötluslepingud under GDPR Article 28
4. Review Eesti Advokatuuri ethics guidance on AI tool use before adopting any cloud-based legal AI tool

### For Large Firms / Corporate Legal (Suured bürood / Ettevõtete õigusosakond)

1. Negotiate Data Processing Agreements (andmetöötluslepingud) with AI service providers before use
2. Consider on-premise deployment with self-hosted LLM for client-facing work
3. Train staff on safe vs. unsafe query patterns — include in annual GDPR and IKS compliance training
4. Designate a Data Protection Officer (andmekaitseametnik) if required under GDPR Article 37 and IKS

### For Government / Public Sector (Riigiasutused / Avalik sektor)

1. Use self-hosted deployment, no external APIs
2. Follow Estonian government IT security requirements under **ISKE** (Infosüsteemide kolmeastmeline etalonturbe süsteem) and RIA (Riigi Infosüsteemi Amet) guidelines
3. Integrate with X-tee (X-Road) data exchange layer only via approved connectors
4. Air-gapped option available for matters classified under the Riigisaladuse ja salastatud välisteabe seadus

---

## Questions and Support

- **Privacy Questions**: Open issue on [GitHub](https://github.com/Ansvar-Systems/Estonian-law-mcp/issues)
- **Anthropic Privacy**: Contact privacy@anthropic.com
- **Eesti Advokatuur Guidance**: Consult the Eesti Advokatuur (advokatuur.ee) for ethics guidance on AI tool use by vandeadvokaadid
- **AKI**: For GDPR and IKS compliance queries, see aki.ee

---

**Last Updated**: 2026-03-06
**Tool Version**: 1.0.0

# Privacy & Client Confidentiality

**IMPORTANT READING FOR LEGAL PROFESSIONALS**

This document addresses privacy and confidentiality considerations when using this Tool, with particular attention to professional obligations under Estonian bar association rules.

---

## Executive Summary

**Key Risks:**
- Queries through Claude API flow via Anthropic cloud infrastructure
- Query content may reveal client matters and privileged information
- Estonian Bar Association rules (Eesti Advokatuur) require strict confidentiality (saladuse hoidmise kohustus) and data processing controls

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

#### 2. Remote Endpoint (Vercel)

```
Endpoint: https://estonian-law-mcp.vercel.app/mcp
```

- Queries transit Vercel infrastructure
- Tool responses return through the same path
- Subject to Vercel's privacy policy

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

Estonian lawyers (vandeadvokaadid) are bound by strict confidentiality rules under the Advokatuuriseadus and the advokaadi eetikakoodeks, enforced by the Eesti Advokatuur (advokatuur.ee).

#### Saladuse Hoidmise Kohustus (Duty of Confidentiality)

- All client communications are privileged under the Advokatuuriseadus § 43
- Client identity may be confidential in sensitive matters
- Case strategy and legal analysis are protected
- Information that could identify clients or matters must be safeguarded
- Breach of confidentiality may result in disciplinary proceedings (distsiplinaarmenetlus) before the Advokatuuri aukohtud

### Estonian Personal Data Protection Act (IKS) and GDPR

Under **GDPR Article 28** and the **Isikuandmete kaitse seadus (IKS)**, when using services that process client data:

- You are the **Data Controller** (vastutav töötleja)
- AI service providers (Anthropic, Vercel) may be **Data Processors** (volitatud töötleja)
- A **Data Processing Agreement** (andmetöötlusleping) may be required
- Ensure adequate technical and organizational measures (tehnilised ja korralduslikud meetmed)
- The Data Protection Inspectorate (Andmekaitse Inspektsioon — AKI, aki.ee) oversees compliance

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

### HIGH RISK: Client-Specific Queries

**DO NOT USE through cloud AI services:**

- Remove ALL identifying details
- Use the local npm package with a self-hosted LLM
- Or use commercial legal databases with proper data processing agreements

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
2. General research: Cloud AI is acceptable for non-client queries
3. Client matters: Use official riigiteataja.ee resources with proper data handling agreements

### For Large Firms / Corporate Legal (Suured bürood / Ettevõtete õigusosakond)

1. Negotiate Data Processing Agreements (andmetöötluslepingud) with AI service providers
2. Consider on-premise deployment with self-hosted LLM
3. Train staff on safe vs. unsafe query patterns

### For Government / Public Sector (Riigiasutused / Avalik sektor)

1. Use self-hosted deployment, no external APIs
2. Follow Estonian government IT security requirements (ISKE — Infosüsteemide kolmeastmeline etalonturbe süsteem)
3. Air-gapped option available for classified matters

---

## Questions and Support

- **Privacy Questions**: Open issue on [GitHub](https://github.com/Ansvar-Systems/Estonian-law-mcp/issues)
- **Anthropic Privacy**: Contact privacy@anthropic.com
- **Eesti Advokatuur Guidance**: Consult the Eesti Advokatuur (advokatuur.ee) for ethics guidance on AI tool use

---

**Last Updated**: 2026-03-06
**Tool Version**: 1.0.0

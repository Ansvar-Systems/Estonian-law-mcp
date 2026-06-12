# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]
### Added
- Metadata-only seed persistence for laws where upstream XML has no extractable provisions.
- Acquisition rebuilt on the Riigi Teataja public-api (`leiaKehtiv` resolution + `blob-xml` text); the retired `/akt/{id}.xml` endpoint is no longer fetched (issue #56).
- Lineage identity guard (repealed / not-yet-in-force veto, lyhend comparison) and seed write-safety gates (zero-provision, 50% shrink, atomic writes).
- Version-identity stamp `_ingest` on every refreshed seed, including `resolved_current_as_of` (the retrieval date — resolution is always now-current).

### Changed
- Replaced synthetic/placeholder seeds with official Riigi Teataja legislation content.
- Curated seeds (10 statutes) refreshed through the repaired pipeline; 4 of 10 statutes had moved upstream.
- One-shot seed migration (PR #57 review): dropped 30 repeal-marker stub provisions the parser no longer emits from 9 `full-*` seeds; renamed `_ingest.kehtiv_as_of` to `resolved_current_as_of` (no date-based version selection ever happens).

### Removed
- `--all-statutes` mode (relied on retired `choosePreferredAct` heuristics; hard error with explanation).
- `--as-of` flag (the metadata endpoint has no date parameter; historical cuts are not supported).
- `--full` corpus mode is gated behind a structured error: `terviktekstID` identifies a consolidation series, not a statute, so the shipped grouping design cannot work. Redesign tracked in issue #58.

## [1.0.0] - 2026-02-21
### Added
- Initial release of Estonian Law MCP
- `search_legislation` tool for full-text search across Estonian legislation
- `get_provision` tool for retrieving specific articles
- `validate_citation` tool for citation validation
- `check_currency` tool for checking if legislation is in force
- `get_eu_basis` tool for EU cross-references
- `get_estonian_implementations` tool for finding national EU implementations
- `search_eu_implementations` tool for searching EU documents
- `validate_eu_compliance` tool for EU compliance checking
- `build_legal_stance` tool for comprehensive legal research
- `format_citation` tool for citation formatting
- `get_provision_eu_basis` tool for provision-level EU references
- `list_sources` tool for data provenance
- `about` tool for server metadata
- Contract tests with 12 golden test cases
- Health and version endpoints
- Vercel deployment (Strategy A, bundled DB)
- npm package with stdio transport

[1.0.0]: https://github.com/Ansvar-Systems/Estonian-law-mcp/releases/tag/v1.0.0

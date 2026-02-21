# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]
### Added
- Full-corpus ingestion mode from Riigi Teataja statute search (`--full`).
- Maximal statute-key ingestion mode including non-active-only laws (`--all-statutes`).
- Metadata-only seed persistence for laws where upstream XML has no extractable provisions.

### Changed
- Replaced synthetic/placeholder seeds with official Riigi Teataja legislation content.
- Expanded corpus coverage from curated scope to full in-force and all-statutes scopes.
- Updated documentation with coverage counts and reproducible ingestion/verification commands.

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

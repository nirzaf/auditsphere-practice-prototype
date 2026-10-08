# SP-04 — Data residency and regulatory regime

| Field | Value |
|---|---|
| Time box | 0.5 agent session for research + firm/legal review |
| Blocks | E02-S01 (resource location is fixed at creation), NFR CMP-02…CMP-04 |
| Output | `docs/ops/data-protection.md` + decision D5 recorded |

## Questions (decision D5)
1. Which regimes apply to the firm and its clients' data: Qatar Law No. 13 of 2016 on Personal Data Privacy Protection (PDPPL); QFC Data Protection Regulations (the repo ships QFC engagement-letter templates, so some clients may be QFC entities); any professional-body or client-contract residency clauses?
2. Does any regime or contract require data to stay in Qatar / the GCC, or restrict cross-border transfer? What safeguards are required if Cloudflare stores data outside Qatar?
3. What location/jurisdiction controls do D1 and R2 offer today (location hints, jurisdictional restrictions)? Fetch current Cloudflare documentation.
4. Retention: confirm the firm's required retention period for audit files (commercial-law record keeping and any QFC requirement) to set the default `retention_policies` term (CMP-02).
5. Processors: list Cloudflare, Microsoft (Entra), the email provider (E04-S01) and any ESP — with the data each receives.

## Method
Research primary sources (official law texts, QFC Authority site, Cloudflare docs) and summarise with citations; the firm's legal adviser confirms. **The agent does not give legal advice; it prepares the question set and evidence.**

## Exit criteria
- Firm's written answer on location/jurisdiction for D1 and R2.
- Personal-data inventory table (data item → table → purpose → retention → processor).
- Default retention term confirmed.

## Result
*(fill in)*

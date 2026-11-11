# 0003: Supabase and Render for the database, auth and hosting

**Status:** Accepted
**Date:** 2026-11-11

The IAS security spec names Firebase Auth and a university data center; the project charter names Supabase and Render. We use Supabase (PostgreSQL and Supabase Auth, with row-level security) and a Node.js, Express and TypeScript API on Render for logic that needs a server, such as hold dispatch, fuzzy search and the audit log. Row-level security is a required control and sits in the same database as the identities it checks, where Firebase Auth would keep identity in a separate system from the policies.

## Considered options

- **Firebase Auth plus self-hosted PostgreSQL in a university data center** (IAS spec): rejected. Two identity and data systems to keep consistent, and no data center access within the project timeline.

## Consequences

- Sign-in is email and password. Emailed codes are used only to verify an email at sign-up and for forgot password.
- UMAK Student, Faculty and NTP / Employee accounts require an `@umak.edu.ph` address; Visitor and Alumni accounts may use any email.
- The IAS spec's Firebase, NGINX and data center references are out of date.

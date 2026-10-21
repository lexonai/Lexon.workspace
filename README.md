# LEXON Workspace v5

One identity, one shared Workspace + Team backend (Supabase Project A), a separate Office backend and a separate Automation backend (Project E), all reached through the central API with backend-enforced permissions.

```
apps/web                         Workspace website (React + Vite)
apps/desktop                     Windows shell (optional)
backend/project-a/supabase       Edge Functions + migrations (Workspace + Team)
backend/project-e-automation/supabase   Edge Functions (YouTube / Instagram)
sql/                             1_WORKSPACE_TEAM, 2_OFFICE, 3_AUTOMATION, 4A/4B/4C upgrades
docs/                            SETUP_GUIDE, ENV_GUIDE, FUNCTIONS_REFERENCE, TESTING_CHECKLIST, integrations
```

Start with `docs/SETUP_GUIDE.md` (or the Setup PDF). Quick local run: `cd apps/web && cp .env.example .env && npm install && npm run dev`.

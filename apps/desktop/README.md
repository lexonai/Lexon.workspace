# Desktop shell (Windows / macOS)

Same code as the web app: this shell only wraps `../web/dist`. Your computer = desktop app. Someone else's computer = the website.

```
cd apps/desktop
npm install
npm run dev            # needs web built once: npm run build:web && npm run prepare:web
npm run dist:win       # on Windows -> dist/*.exe
npm run dist:mac       # on a Mac   -> dist/*.dmg
```
Required before first use:
- Supabase Dashboard, Authentication, URL Configuration: add `lexon://app/**` to Redirect URLs (Team shell uses `lexon-team://app/**`).
- `apps/web/.env` must contain VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY (they are compiled into the build; they are public values).

Security notes: contextIsolation + sandbox, no Node in the page, custom-scheme file server with path-traversal check, CSP header, navigation locked to the app, camera/microphone only for the app, one validated IPC call. Sign in opens your system browser (Google blocks embedded browsers) and returns through the `lexon://` deep link.
Unsigned builds show OS warnings: Windows SmartScreen and macOS Gatekeeper. Code-signing certificates are needed for a clean install experience; auto-update is not included.

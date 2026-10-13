# Mounting LEXON OFFICE inside LEXON WORKSPACE (or anything else)
Same codebase, same build. No Workspace code is imported by Office, and Office has its own login/database.

## 1. Build the embeddable web app
```
npm run build:web -- /office        # served under https://workspace.example.com/office/
# or: npm run build:web             # served at a domain root
```
Output: `./web` (static files). Host it as static files, or run `npm run server` (serves `web/` + API + mobile admin), or `docker compose up`.
Set once at build time who may control it: `NEXT_PUBLIC_ALLOWED_PARENT_ORIGINS=https://workspace.example.com` (default: same origin only).
Optional server header: `OFFICE_FRAME_ANCESTORS="https://workspace.example.com"`.

## 2. Mount it
React: copy `integration/OfficeFrame.tsx`:
```tsx
<OfficeFrame src="https://workspace.example.com/office/office/" bare onEvent={e=>console.log(e)} ref={r}/>
r.current.send({type:'office.task.request',title:'Create a YouTube thumbnail'})
```
Plain HTML: `<iframe src=".../office/office/?embed=1" allow="microphone; fullscreen">` and `iframe.contentWindow.postMessage({target:'lexon-office',type:'office.navigate',section:'chat'}, origin)`.
`embed=1` hides Office's header; `embed=bare` also hides its navigation (host drives it with `office.navigate`).

## 3. Messages
See `workspace-events.ts` (Office → host: task created/status/handoff/completed, presence, unread, notifications) and commands (host → Office: task request, chat send, navigate, camera/person focus, snapshot).
The Windows .exe uses the exact same app (Electron wrapper, `electron/main.js`).

## Single sign-on (no Workspace code inside Office)
Run the Office server with `OFFICE_SSO_SECRET=<long random>`. From your **Workspace backend** call
`POST {office}/api/sso {secret, username, role:'owner'|'admin'|'viewer'}` → `{token}` and open the iframe with
`?officeToken=<token>` (Office stores it and strips it from the URL). Tokens last 12 h. Keep the secret server-side only.
## What the host can drive
Free Walk (`office.mode.set`), calling people to rooms (`office.room.call`), starting a voice call (`office.call.start`), camera/person focus, tasks and chat — see `workspace-events.ts`.
Microphone/voice needs `allow="microphone; autoplay"` on the iframe (OfficeFrame sets it) and HTTPS in production.

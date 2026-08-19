# Trace

A place for thoughts you don't want to lose.

Trace is a capture-first notes app. It opens on a cursor: type the thought, press `⌘↵`,
and it's timestamped and kept. Everything else — search, tags, connections, the AI —
happens after the fact, so nothing ever gets between you and writing the thing down.

Single HTML file. No build step. No framework. No tracking.

---

## What's in it

**Capture**
- Opens straight into the input. No "new note" button, no title field.
- `⌘↵` saves. Every note keeps an immutable `created_at`.
- Voice dictation via the Web Speech API — tap **Speak**, talk, it transcribes live.
- `#hashtags` in the body become real tags automatically.

**Finding things again**
- Instant search across title, body and tags, with match highlighting.
- `⌘K` command palette: jump to any note, any tag, or run any action.
- Timeline grouped by day — Today, Yesterday, then weekdays, then dates.
- Related notes on every note, computed locally with cosine similarity. No API needed.

**The AI**
Bring your own Anthropic API key (Settings → Intelligence). It's stored in this browser's
local storage on this device, and only ever sent to `api.anthropic.com`.

- **Auto-analyse on save** — quietly gives each note a real title, 1–4 tags and a one-line gist.
- **Ask Trace** — a question answered *only* from your own notes, streamed, with the source notes cited underneath and clickable.
- **Digest** — a weekly or monthly read-back: what you were preoccupied with, what's worth pulling on, and what you wrote down and never came back to.
- **Resurface** — pulls a random older note back into view.
- **Expand** — develops a scrappy note into next moves plus one honest objection.

**Passcode**
- An iPhone-style lock screen over the whole vault. Default passcode is **0528** — change it in Settings → Privacy.
- Nothing renders until it's accepted: an inline pre-paint check locks the document before the first frame, so no note ever flashes on screen.
- Blurs itself when you switch apps, so your notes aren't sitting in the iOS app switcher preview.
- Auto-locks when you leave — immediately, or after 1 / 5 / 15 minutes.
- Escalating delay after five wrong tries. `⌘L` locks on demand.

**Storage**
- Local-first: every note is written to IndexedDB immediately. The app works fully offline.
- Optional sync to your own Supabase, over PostgREST. Last-write-wins on `updated_at`.
- Sync is *additive* — turning it off never loses anything, it just stops mirroring.
- Export to JSON (restorable) or Markdown (readable). Import merges back in.

**iPhone**
- Installable PWA. Add to Home Screen and it opens fullscreen with no browser chrome.
- Service worker caches the shell, so it launches and works with no signal.
- Home-screen shortcuts: **New note** and **Ask Trace**.
- Respects safe-area insets, follows system light/dark.

---

## Keyboard

| | |
|---|---|
| `⌘K` | Command palette |
| `⌘↵` | Save the note you're typing |
| `⌘F` or `/` | Search |
| `⌘J` or `a` | Ask Trace |
| `⌘N` or `n` | New note |
| `⌘S` | Sync now |
| `⌘L` | Lock |
| `⌘,` | Settings |
| `↑` `↓` | Move through notes |
| `s` | Star the selected note |
| `e` | Archive the selected note |
| `⌫` | Move the selected note to trash |
| `esc` | Close whatever's open |

On Windows/Linux, `Ctrl` replaces `⌘`.

---

## Setup

### 1. Database (one time)

Open your Supabase SQL editor and run [`supabase/schema.sql`](supabase/schema.sql).
It creates the `notes` table, its indexes, and RLS policies for the anon role.

### 2. Point the app at it

In the app: **Settings → Sync**
- Turn on *Sync to my server*
- **Supabase URL** — e.g. `https://supabase.ry-server.com`
- **Anon key** — the project's public anon key

Hit *Sync now*. The dot next to Settings turns green when it's mirroring.

### 3. Turn on the AI

**Settings → Intelligence** → paste an Anthropic API key from
[console.anthropic.com](https://console.anthropic.com/settings/keys) → *Test connection*.

Skip this and everything except the AI features still works.

---

## Deploying

Static site — no build, no runtime, no environment variables.

**Coolify**: new resource → this repo → build pack **Static** → publish directory `/` →
set the domain → deploy. Add the subdomain as a public hostname on the Cloudflare tunnel first.

Anything that serves files works too: Netlify, Vercel, GitHub Pages, `python -m http.server`.

> Install as a PWA and dictation both require **HTTPS** (or `localhost`).

---

## Files

```
index.html              the entire app — markup, styles, logic
manifest.webmanifest    PWA metadata, icons, home-screen shortcuts
sw.js                   offline shell; network-first HTML, cache-first assets
supabase/schema.sql     notes table, indexes, RLS policies
icon-*.png              app icons (192, 512, 1024, 180 for iOS, maskable)
build/                  the source fragments index.html is assembled from
```

To edit: change a file in `build/`, then

```bash
cat build/1-head.html build/2-body.html build/3a-core.js build/3b-data.js \
    build/3c-render.js build/3d-ai-ui.js build/3e-shell.js build/3e2-lock.js \
    build/3f-events.js > index.html
```

---

## On the passcode

The passcode is stored as a PBKDF2-SHA256 hash (210,000 rounds, random 16-byte salt),
never in plain text, and the notes are never painted before it's accepted.

Be clear-eyed about what that buys you. This is a **lock screen, not encryption** — the
notes themselves sit unencrypted in IndexedDB. It stops someone picking up your unlocked
phone and reading your vault. It will not stop someone sitting at this device with the
developer tools open, and a 4-digit code is 10,000 combinations regardless of how it's
stored. If you ever put something in here that genuinely needs to survive a determined
adversary, that's a different feature and worth asking for by name.

## On keys and privacy

Your notes go to two places and no others: this browser's IndexedDB, and — if you turn
sync on — the Supabase you pointed it at. Your Anthropic key lives in this browser's
local storage; it is never written into a note, never sent to Supabase, and never
included in an export.

The anon key in a browser app is public by design. The RLS policies in `schema.sql`
grant the anon role full access to the `notes` table and nothing else — appropriate for
a single-user vault on your own server, but worth understanding before you put anything
in here you'd mind a determined visitor reading. If that matters, add Supabase Auth and
tighten the policies to `auth.uid() = user_id`.

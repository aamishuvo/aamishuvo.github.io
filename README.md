# iamshuvo — aamishuvo.github.io

Personal site of **Md. Mahmudul Islam (Shuvo)** — program management, PMO governance, and digital platform delivery.

Built with [Astro](https://astro.build) (static output, Content Collections for the blog), **vanilla JavaScript** (no framework, no runtime dependencies), and [Three.js](https://threejs.org) bundled at build time. Hosted on GitHub Pages.

## Features

- **3D character** — a stylized Three.js avatar that tracks your cursor, blinks, and dances in Zero Bullshit mode
- **Zero Bullshit mode** — dark theme, generative Web Audio groove, and blunter copy across the whole site
- **Interactive board** — draggable post-its connected by SVG wires; click a cell and a note pops up, then falls after 8 seconds
- **Strategic diagnostic** — a 3-question quiz with synthetic voice (Web Speech API), a scored verdict, and lead capture
- **Blog** — Astro Content Collections, Markdown posts in English and Bengali
- **Bilingual** — English at `/`, বাংলা at `/bn/`
- **Admin panel** — `/admin/` manages every piece of content (see below)
- Fully responsive, static, zero runtime dependencies

## Local development

```bash
npm install
npm run dev        # dev server at localhost:4321
npm run build      # static build into dist/
```

## Deployment (one-time setup)

1. Merge to `main`.
2. In the repo settings → **Pages** → set **Source** to **GitHub Actions**.
3. Every push to `main` builds and deploys automatically via `.github/workflows/deploy.yml`.

## Admin panel

Open `https://aamishuvo.github.io/admin/` (or `/admin/` on any deployment).

1. Create a **fine-grained personal access token** at GitHub → Settings → Developer settings → Fine-grained tokens:
   - Repository access: **only this repository**
   - Permissions: **Contents → Read and write**
2. Sign in with the token. It is stored only in your browser (session by default) and only ever sent to `api.github.com`.
3. Edit any tab — site copy (EN/বাংলা, including the Zero Bullshit variants), post-its, the diagnostic quiz, settings, blog posts, images.
4. **Save & publish** commits to `main`; GitHub Actions rebuilds the site in about a minute.

### Content files

| What | Where |
|---|---|
| Site copy (EN / BN, incl. Zero Bullshit variants) | `src/data/en.json`, `src/data/bn.json` |
| Post-it board | `src/data/postits.json` |
| Diagnostic quiz (questions, verdicts) | `src/data/quiz.json` |
| Email, social links, lead endpoint | `src/data/settings.json` |
| Blog posts | `src/content/blog/en/*.md`, `src/content/blog/bn/*.md` |
| Images | `public/assets/img/` |

### Using a realistic 3D avatar (your own face)

The hero character has two modes. By default it renders a built-in low-poly figure
(jeans, tee, open blazer) drawn entirely in code. To replace it with a realistic
cartoon avatar of yourself:

1. Go to **readyplayer.me**, choose **Create Avatar**, and upload a selfie. It builds a
   rigged 3D character from your photo — pick the outfit closest to what you want.
2. Download the avatar as a **`.glb`** file (Ready Player Me offers a direct `.glb`
   download; alternatively append `.glb` to the avatar URL it gives you).
3. In `/admin/` → **Settings** → **Avatar model** → **Upload…**, select that `.glb`.
   It is committed to `public/assets/models/` and the path is filled in for you.
4. Save & publish. The site loads your model instead of the built-in figure.

The model keeps every behaviour: the head follows the cursor, it dances in Zero
Bullshit mode, it blinks, and on phones you can drag to turn it and tap to make it
dance. Blinking and smiling use the model's blendshapes when it has them.

Requirements for the model: rigged humanoid, bones named in the common convention
(`Head`, `Neck`, `Spine`, `LeftArm`, `RightArm`, `LeftForeArm`, `RightForeArm`,
`LeftUpLeg`, `RightUpLeg` — a `mixamorig:` prefix is fine). Keep it under ~10 MB so
the page stays fast. If the file fails to load, the site silently falls back to the
built-in figure.

### Lead capture

Quiz leads open a pre-filled email to `contactEmail` by default. To capture leads silently as well, set `leadEndpoint` in `src/data/settings.json` (Settings tab in the admin) to a form endpoint such as [Formspree](https://formspree.io) — the quiz will POST name, email, score, and answers there.

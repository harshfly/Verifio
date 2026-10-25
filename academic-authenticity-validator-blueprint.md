# Academic Authenticity Validator — Full Project Blueprint

> An AI-based authenticity validation system for academic content: detects plagiarism, duplicate submissions, AI-generated content, manipulated documents, and suspicious similarities. Outputs an authenticity score with detailed, explainable reports.

This document is the single source of truth for building this project end to end — architecture, API contracts, UI system, folder structure, and a phase-by-phase build plan with ready-to-use prompts for an AI coding assistant (Claude Code, Cursor, etc.).

---

## 1. Tech stack

| Layer | Choice | Why |
|---|---|---|
| Frontend | React (Vite) + TypeScript + Tailwind CSS + shadcn/ui | Fast dev loop, typed, industry-standard component system |
| State/data | TanStack Query + Zustand | Server-state caching + light client state, no Redux overhead |
| Backend | FastAPI (Python) | Async, auto-generated OpenAPI docs, matches your ML stack |
| Database | PostgreSQL (via SQLAlchemy + Alembic) | Relational integrity for submissions/reports; JSONB for flexible score breakdowns |
| Vector search | FAISS or pgvector | Semantic similarity search across submission corpus |
| Task queue | Celery + Redis | Document processing is slow (OCR, embeddings, ML inference) — must be async, not blocking the request |
| File storage | Local disk (dev) → S3-compatible bucket (prod) | Original files must be retained for manipulation/metadata checks |
| Auth | JWT (FastAPI + `python-jose`) with role-based access (student / evaluator / admin) | Reports are sensitive — access control is not optional |
| Deployment | Docker Compose (dev) → Render/Railway/Fly.io or a VPS (prod) | Reproducible environments, one command to run everything |
| ML/NLP | `sentence-transformers`, `transformers` (Hugging Face), scikit-learn | Free, open, matches earlier design decisions |

---

## 2. Folder structure

```
academic-authenticity-validator/
├── backend/
│   ├── app/
│   │   ├── main.py                      # FastAPI app entrypoint
│   │   ├── core/
│   │   │   ├── config.py                # env vars, settings (pydantic-settings)
│   │   │   ├── security.py              # JWT, password hashing
│   │   │   └── logging.py
│   │   ├── api/
│   │   │   └── v1/
│   │   │       ├── router.py
│   │   │       ├── endpoints/
│   │   │       │   ├── auth.py
│   │   │       │   ├── submissions.py
│   │   │       │   ├── reports.py
│   │   │       │   └── admin.py
│   │   ├── db/
│   │   │   ├── session.py
│   │   │   ├── models/
│   │   │   │   ├── user.py
│   │   │   │   ├── submission.py
│   │   │   │   └── report.py
│   │   │   └── migrations/              # Alembic
│   │   ├── pipeline/
│   │   │   ├── preprocessing.py         # extraction, cleaning, segmentation
│   │   │   ├── plagiarism.py
│   │   │   ├── ai_detection.py
│   │   │   ├── manipulation.py
│   │   │   ├── similarity.py
│   │   │   ├── scoring.py               # weighted aggregation engine
│   │   │   └── orchestrator.py          # runs the full pipeline, called by the Celery task
│   │   ├── tasks/
│   │   │   └── celery_worker.py
│   │   ├── schemas/                     # Pydantic request/response models
│   │   │   ├── submission.py
│   │   │   └── report.py
│   │   └── services/
│   │       ├── storage.py               # file save/retrieve abstraction
│   │       └── vector_store.py
│   ├── tests/
│   ├── requirements.txt
│   ├── Dockerfile
│   └── alembic.ini
├── frontend/
│   ├── src/
│   │   ├── main.tsx
│   │   ├── App.tsx
│   │   ├── routes/
│   │   │   ├── Dashboard.tsx
│   │   │   ├── Upload.tsx
│   │   │   ├── SubmissionDetail.tsx
│   │   │   ├── ReportView.tsx
│   │   │   └── Login.tsx
│   │   ├── components/
│   │   │   ├── ui/                      # shadcn primitives (button, card, dialog...)
│   │   │   ├── layout/
│   │   │   │   ├── Sidebar.tsx
│   │   │   │   ├── Navbar.tsx
│   │   │   │   └── AppShell.tsx
│   │   │   ├── upload/
│   │   │   │   └── DropzoneUploader.tsx
│   │   │   ├── report/
│   │   │   │   ├── ScoreGauge.tsx
│   │   │   │   ├── ModuleBreakdownCard.tsx
│   │   │   │   ├── FlaggedTextViewer.tsx
│   │   │   │   └── SourceMatchList.tsx
│   │   │   └── shared/
│   │   ├── lib/
│   │   │   ├── api.ts                   # typed API client (axios/fetch wrapper)
│   │   │   └── utils.ts
│   │   ├── hooks/
│   │   │   ├── useSubmissions.ts
│   │   │   └── useReport.ts
│   │   ├── stores/
│   │   │   └── authStore.ts
│   │   └── styles/
│   │       └── globals.css
│   ├── index.html
│   ├── tailwind.config.ts
│   ├── vite.config.ts
│   └── package.json
├── docker-compose.yml
├── .env.example
└── README.md
```

---

## 3. Database schema (core tables)

```sql
users (id, name, email, password_hash, role, created_at)

submissions (
  id, user_id, title, original_filename, storage_path,
  file_type, status,            -- pending | processing | completed | failed
  uploaded_at, processed_at
)

document_metadata (
  submission_id, created_at_meta, modified_at_meta,
  author_field, producer_software, revision_count, raw_metadata_json
)

reports (
  id, submission_id,
  authenticity_score,           -- 0-100
  plagiarism_score, ai_detection_score,
  manipulation_score, similarity_score,
  weight_config_json,
  status,                       -- clean | review | flagged
  generated_at
)

flagged_segments (
  id, report_id, sentence_id, segment_text,
  module,                       -- plagiarism | ai_detection | manipulation | similarity
  severity, matched_source_ref, confidence
)

corpus_documents (
  id, submission_id, embedding_vector, indexed_at
)   -- backing store for similarity search
```

---

## 4. API design (v1)

```
POST   /api/v1/auth/register
POST   /api/v1/auth/login
GET    /api/v1/auth/me

POST   /api/v1/submissions              # multipart upload, returns submission_id, kicks off Celery task
GET    /api/v1/submissions              # list (paginated, filterable by status/date)
GET    /api/v1/submissions/{id}
DELETE /api/v1/submissions/{id}

GET    /api/v1/submissions/{id}/status  # poll while processing (or use websocket, see Phase 4)
GET    /api/v1/reports/{submission_id}  # full report: scores + flagged_segments
GET    /api/v1/reports/{submission_id}/export   # PDF export of report

GET    /api/v1/admin/stats              # aggregate dashboard metrics
GET    /api/v1/admin/weight-config      # get current scoring weights
PUT    /api/v1/admin/weight-config      # adjust module weights (admin only)
```

Every list/detail endpoint returns typed Pydantic response models — generate the frontend's TypeScript types from the OpenAPI schema (`openapi-typescript`) so frontend and backend never drift.

---

## 5. UI/UX system

**Design direction:** clean, evidence-forward, "trustworthy lab report" — not a flashy consumer app. Evaluators need to scan results fast; students need to understand *why* they got a score.

- **Typography:** one sans (Inter or Geist) for UI, one mono (JetBrains Mono) for scores/percentages and matched-text excerpts — the mono treatment visually signals "this is evidence, not prose."
- **Color system:** neutral base (slate/zinc), with a single semantic ramp for status — green (clean), amber (review), red (flagged). Never use red/green as the *only* signal — pair with icons/labels for accessibility.
- **Score gauge:** a circular/arc gauge as the hero element of the report page — the one number evaluators want first, with a one-line status label under it.
- **Module breakdown:** four cards (plagiarism, AI-detection, manipulation, similarity) each with their own sub-score, expandable to show flagged evidence — don't make evaluators dig for what triggered a flag.
- **Flagged text viewer:** the original document rendered with inline highlights (colored underline, not full-background fill, for readability) — clicking a highlight opens a side panel with the matched source and confidence score.
- **Responsive:** sidebar collapses to a bottom nav or hamburger drawer under 768px; report page stacks module cards vertically on mobile instead of a 4-column grid; the flagged text viewer becomes full-width with the evidence panel as a bottom sheet instead of a side panel.
- **Dark mode:** supported from day one via CSS variables — don't retrofit it later.
- **Empty/loading/error states:** every async view needs all three explicitly designed — processing can take 30–90 seconds, so the "processing" state needs a real progress indicator (see Phase 4 websocket note), not just a spinner.

---

## 6. Pipeline recap (see full detail in project chat history)

`Upload → Preprocessing (extraction, cleaning, segmentation, metadata capture) → [Plagiarism | AI-detection | Manipulation | Similarity] (parallel) → Scoring engine (weighted aggregation) → Report + evaluator dashboard`

Each module returns a sub-score (0–100) plus a list of flagged segments with evidence. The scoring engine combines them with configurable weights and produces threshold-banded status (clean / review / flagged) — never a binary verdict.

---

## 7. Phase-by-phase build plan

Each phase is scoped to be completable independently and includes a ready-to-use prompt block — paste these into Claude Code (or your assistant of choice) one at a time, in order. Do not skip ahead; each phase assumes the previous one's scaffolding exists.

### Phase 0 — Project scaffolding

**Goal:** repo structure, Docker Compose, env config, CI skeleton.

> **Prompt:**
> "Set up a monorepo with `backend/` (FastAPI, SQLAlchemy, Alembic, Celery, Redis) and `frontend/` (Vite + React + TypeScript + Tailwind + shadcn/ui). Add a `docker-compose.yml` with services for the API, Postgres, Redis, and a Celery worker. Add `.env.example` with all required variables. Add a basic GitHub Actions workflow that runs backend tests and frontend lint on push. Follow the folder structure in `blueprint.md` exactly."

### Phase 1 — Auth & user model

**Goal:** register/login, JWT, role-based access (student/evaluator/admin).

> **Prompt:**
> "Implement JWT-based auth in the FastAPI backend: `User` model with roles (student, evaluator, admin), `/auth/register`, `/auth/login`, `/auth/me` endpoints, password hashing with bcrypt, and a dependency that protects routes by role. On the frontend, build a login page, an auth store (Zustand) that persists the token, and a protected-route wrapper for the dashboard routes."

### Phase 2 — Upload & storage

**Goal:** file upload endpoint, storage abstraction, submission record creation.

> **Prompt:**
> "Implement `POST /api/v1/submissions`: accept multipart file upload (PDF/DOCX), validate file type and size, save via a `StorageService` abstraction (local disk for now, swappable for S3 later), create a `Submission` row with status `pending`, and return the submission id. On the frontend, build a drag-and-drop uploader component with progress feedback, and a submissions list page showing status badges."

### Phase 3 — Preprocessing pipeline

**Goal:** the extraction/cleaning/segmentation stage as a standalone, testable module.

> **Prompt:**
> "Implement `app/pipeline/preprocessing.py`: extract text from PDF (via pdfplumber, with OCR fallback via pytesseract if extraction returns near-empty text) and DOCX (via python-docx). Clean the text (normalize unicode, de-hyphenate line-wrapped words, strip headers/footers). Segment into sentences with stable IDs. Capture raw file metadata (timestamps, author, producer) into a separate dict. Return a single structured `ProcessedDocument` object as specified in the blueprint's schema section. Write unit tests with sample PDF/DOCX fixtures."

### Phase 4 — Async task orchestration

**Goal:** wire preprocessing into a Celery task, add status polling.

> **Prompt:**
> "Set up a Celery worker (`app/tasks/celery_worker.py`) with Redis as the broker. Create a task that runs the preprocessing pipeline when a submission is uploaded, updates the submission's status through `pending → processing → completed/failed`, and stores the `ProcessedDocument` result. Add `GET /api/v1/submissions/{id}/status` for polling. On the frontend, poll this endpoint with TanStack Query while status is `processing`, and show a real progress indicator, not just a spinner."

### Phase 5 — Detection modules (build one at a time)

**Goal:** plagiarism, similarity, AI-detection, manipulation — each as an independent pipeline stage.

> **Prompt (plagiarism + similarity):**
> "Implement `app/pipeline/plagiarism.py` and `app/pipeline/similarity.py`. Use `sentence-transformers` (`all-MiniLM-L6-v2`) to embed each sentence of the processed document. Store embeddings for prior submissions in a `corpus_documents` table (or FAISS index). For plagiarism, compute exact/near-exact n-gram overlap against the corpus for verbatim matches. For similarity, compute cosine similarity against corpus embeddings for paraphrase-level matches. Both return a sub-score (0-100) and a list of flagged segments with `matched_source_ref` and `confidence`."

> **Prompt (AI detection):**
> "Implement `app/pipeline/ai_detection.py` using the Hugging Face `roberta-base-openai-detector` model for a baseline classification score per paragraph, and implement a perplexity/burstiness heuristic as a second signal using a small open model (e.g. GPT-2) via `transformers`. Combine both into a single sub-score, and flag paragraphs above a configurable threshold. Clearly label this module's output as a probability/likelihood, never a certainty, in both the API response and any docstrings."

> **Prompt (manipulation):**
> "Implement `app/pipeline/manipulation.py`: analyze the raw file's metadata (from the preprocessing stage) for anomalies — inconsistent creation/modification timestamps, mismatched producer software, unusual revision counts, font inconsistencies in the PDF object structure. Map found anomalies to a severity-weighted sub-score and flagged-segment list."

### Phase 6 — Scoring engine + orchestrator

**Goal:** tie all four modules together into one pipeline run with a final weighted score.

> **Prompt:**
> "Implement `app/pipeline/scoring.py` with a configurable weighted-aggregation function per the formula in the blueprint, and threshold bands (clean/review/flagged). Implement `app/pipeline/orchestrator.py` to run preprocessing, then all four detection modules in parallel (via `asyncio.gather` or parallel Celery subtasks), then scoring, and persist the result to the `reports` and `flagged_segments` tables. Update the Celery task from Phase 4 to call this orchestrator instead of just preprocessing."

### Phase 7 — Report API + report UI

**Goal:** the full report experience — the centerpiece of the product.

> **Prompt:**
> "Implement `GET /api/v1/reports/{submission_id}` returning the full report with nested flagged segments. On the frontend, build the report page: a `ScoreGauge` hero component, four `ModuleBreakdownCard` components (one per detection module, expandable to show evidence), and a `FlaggedTextViewer` that renders the original document text with inline highlights linked to a side panel showing matched sources. Follow the UI/UX system section of the blueprint exactly — status colors, mono font for evidence text, responsive stacking under 768px."

### Phase 8 — Evaluator dashboard + admin controls

**Goal:** aggregate views, weight configuration.

> **Prompt:**
> "Build an evaluator dashboard page showing aggregate stats (submissions by status, score distribution chart) and a filterable/sortable submissions table. Build an admin page for adjusting the scoring engine's module weights via `PUT /api/v1/admin/weight-config`, with validation that weights sum to 1."

### Phase 9 — Polish, PDF export, deployment

**Goal:** production-readiness.

> **Prompt:**
> "Implement `GET /api/v1/reports/{submission_id}/export` generating a PDF version of the report (via WeasyPrint or a headless-browser render of the report page). Add rate limiting on the upload endpoint. Write a production `docker-compose.prod.yml` and a deployment README for Render/Railway/Fly.io. Add basic Sentry error tracking on both frontend and backend. Do a final pass on mobile responsiveness across every page."

---

## 8. Industry-standard checklist (don't skip these)

- [ ] Input validation on every endpoint (file type/size limits, request schemas)
- [ ] Environment-based config (never hardcode secrets; `.env` + `.env.example`)
- [ ] Database migrations tracked in version control (Alembic)
- [ ] API versioned (`/api/v1/...`) so breaking changes don't break old clients
- [ ] Automated tests for the pipeline modules (these are the core IP — test them well)
- [ ] Rate limiting on upload endpoint (prevents abuse/cost blowup on ML inference)
- [ ] Structured logging (not print statements) with request IDs for tracing
- [ ] CORS configured explicitly, not wildcard, before any real deployment
- [ ] Accessibility: color is never the only signal, all interactive elements keyboard-navigable
- [ ] Loading/empty/error states designed for every async view
- [ ] README with setup instructions a new contributor could follow cold

---

*Generated for Harsh's final-year major project. Paste each phase's prompt into your AI coding assistant in order — don't jump ahead, since each phase assumes the previous scaffolding exists.*

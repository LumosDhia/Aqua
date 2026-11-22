# Roadmap: accounts, profiles, hiring and trust

Two kinds of people use Aqua: **farmers** and **farm workers**. This roadmap adds account types, onboarding, CVs, matching by distance, hiring with work history, chat, and reports. Nine chunks, built in order. A chunk is done only when its backend tests pass and its screens are checked in a real browser (desktop and phone, no window scroll, nothing clipped).

## Rules for every chunk

- **Interface:** the whole app fits the screen on desktop (no window scroll). Long lists scroll inside their own area. No card clips or overlaps its content. Phones may scroll normally.
- **Real demos:** every chunk adds believable sample data for the new feature to the sample community (fictional people only).
- **Privacy:** public profiles show name, headline, skills, experience and the governorate. Never email, phone or exact address. Contact happens through in-app chat after a hire. CV files and farm drawings are private files, served only to the owner (and farm members for drawings).
- **Location:** people and farms are placed by governorate (approximate), and distances are between governorate centres.
- **AI:** reading CVs and drawings and writing a CV from a description use the language model on the GPU server (`LLM_API_URL`). Without it everything still works through the manual form, and the AI helpers say so.

## Chunks

### 1. Account types and profile foundation
- Backend: `users.account_type` (`farmer` or `worker`), a `Profile` per user (headline, bio, governorate, visibility public or private, search radius in km, looking for work, kinds of work, skills, languages, availability). Sign-up takes the type. Profile endpoints to read and edit mine.
- UI: the sign-up form asks "I am a farmer / I am a farm worker". After login a farmer sees the farm dashboard; a worker with no farm sees a **Worker home** (empty shell for now with Opportunities, My applications and Profile entries). A basic **Profile** page to edit headline, bio, location, skills, visibility and radius.
- Done when: both types can sign up, land on the right home, and edit and save a profile.

### 2. Farmer onboarding wizard
- Backend: farm `description`, optional `sketch` image (private upload), `POST /api/onboarding/farmer` creating the farm, plots, water sources and animals from the answers in one step.
- UI: after a farmer signs up, a wizard asks name and region, main crops and sizes, irrigation, water sources, animals, and whether there is a farm board. Then a choice: **Describe my farm** (written description, optional picture of a drawing) or **Draw my farm** (upload a hand-drawn picture, with an example drawing shown, description optional). The dashboard is set up from the answers.
- Done when: a new farmer finishes the wizard and lands on a populated dashboard with their description or drawing visible.

### 3. CV for workers (and farmers who also work)
- Backend: structured `Cv` (summary, experience, education, skills, languages, certifications), upload of a CV file (PDF, Word, text, photo) kept private, read-from-CV, write-from-description, and fix-with-instruction, all through the AI helper when configured.
- UI: worker onboarding asks to upload a CV and fills the form from it, or skip and fill the form by hand. The user sees what was understood and can correct it by typing a correction or confirm "yes, this is what I meant". Or just describe what they know and a CV is created. A readable CV page.
- Done when: a worker can create a complete CV by upload, by form and by description, and fix mistakes.

### 4. Visibility, radius and discovery
- Backend: job reach radius, public or private profiles (private cannot apply), opportunity feed for workers and candidate feed for farmers, both filtered by distance and by what was asked (kinds, skills), with an adjustable radius.
- UI: worker "Opportunities" with a radius slider and filters. Farmer "Find workers" with the same. Public profile pages. A private profile is told why it cannot apply.
- Done when: changing the radius changes who and what appears, and a private worker cannot apply.

### 5. Hiring, work and experience
- Backend: `Engagement` created when a farmer accepts an application (temporary or full time), statuses active, finished, disapproved. The farmer marks the job finished (adds verified experience to the worker) or disapproves with a reason. After finishing, a temporary worker can be upgraded to full time. The public profile shows "Works at <farm>".
- UI: farmer "Hired workers" section in Workers. Worker "My work" with current engagements and tasks.
- Done when: accept, finish, disapprove and upgrade all work and show in both interfaces.

### 6. Chat
- Backend: messages between the farmer and a worker per engagement, unread counts.
- UI: a Messages page and a chat panel in the engagement, rail badge for unread.
- Done when: both sides can talk and see unread counts.

### 7. Reports to Aqua
- Backend: report a user (scam, no-show, unsafe, harassment, other, with details and the related engagement), an admin queue, status, notes and suspend. Rate limits.
- UI: "Report this person" on profiles and engagements, "My reports" status, and an admin page.
- Done when: a report reaches the admin, can be resolved, and a suspended account is locked out.

### 8. Worker home and switching
- UI: a proper Worker home (active work, tasks, opportunities, applications, messages), a switch to the farmer dashboard that starts the wizard, and a farmer's CV and "apply for jobs" path. Role-aware rail and routing.
- Done when: a worker can become a farmer too, and a farmer can apply for jobs, with the right navigation each time.

### 9. Sample community and final pass
- Sample workers with CVs, profiles, engagements, chats and reports, public and private examples, farmer drawings. Full regression, fit-to-screen and phone checks, README.

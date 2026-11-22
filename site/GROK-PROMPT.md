You are building the HOME PAGE of a real product website called **Aqua**. Work only inside the current folder (`/home/aram/Projects/Aqua/site`). Create plain static files: `index.html`, `css/style.css`, `js/main.js`. No frameworks, no build step, no npm. Photos already exist in `images/`. The style reference is the image `reference.jpg` in this folder: open and study it first. Do not download anything and do not modify the files in `images/`.

## What Aqua is
Aqua is a smart water assistant for farms in Tunisia. Sensors in the soil and in the water tank, plus the weather forecast, tell the farmer when to water, how much, and when to wait for rain so water is saved. It also gives crop guidance, a farming advisor chatbot (it understands Tunisian farming, and the farmer can talk to it by voice), and alerts on the phone. It works on the web, desktop and Android.

This is a real, serious product. NEVER mention a hackathon, a competition, a contest, a team, students, a prototype or a demo.

## Content rules (strict)
- All text in English. Tiny decorative Japanese characters are allowed only as ornament (for example 水 water, 農 farm, 恵 blessing), never as the actual content.
- NO numbers anywhere: no statistics, percentages, prices, dates, years, counts, phone numbers, "24/7", "10x", step numbers like 01/02, or numbered lists. Use words and icons instead. Pagination dots are fine.
- Only describe things Aqua actually does, taken from this list. Do not invent partners, awards, logos, customers, testimonials or press.
  - Watches soil moisture and the level of the water tank, and shows how they change over time (monitoring status and trends).
  - Reads the weather forecast and decides: water now, water a little, or wait for the rain. Shows the water saved.
  - Knows the crops most grown on Tunisian farms and calculates what each crop needs.
  - Water planning for the week, the month and the year, by water source (well, public network, rain tank).
  - Advisor chatbot specialised in Tunisian farming, with voice, so that everyone can use it, including people who do not read easily.
  - Alerts on WhatsApp and on the phone (empty tank, dry soil, rain coming).
  - A visual map of the farm with coloured plots.
  - Roles for the team on a farm (owner, manager, technician, viewer) so each person sees and does only what they should.
  - Practical guides and learning material inside the app, so farmers and young people and women entering farming can learn best practices.
  - Less impact on natural resources: less water wasted, less energy used, solar power ready.
  - Works on web, desktop and Android.
- Do NOT mention fisheries, aquaculture policy, FAO, UN, governments, or anything not in the list.

## Visual style: copy the attached reference.jpg, but Japanese-styled and in English
The reference is a Japanese-style agricultural association home page. Reproduce its design language:
- Warm cream "washi paper" background with a very subtle paper texture (CSS only), deep forest green and teal as main colours, soft leaf green and a little warm orange/ochre, small red seal (hanko) accent.
- Large rounded organic WAVE and hill dividers between sections, layered green and teal with thin line patterns (inline SVG). The hero image fades into a wave, the footer is a dark green wave with contour lines.
- Vertical text: the hero headline and the section titles use `writing-mode: vertical-rl` like the reference (English letters rotated, elegant serif). On small screens switch them to horizontal.
- Serif display font with a Japanese feel (Google Fonts: "Shippori Mincho" or "Noto Serif JP" for headings, "Noto Sans" or "Zen Kaku Gothic New" for body). Link them from Google Fonts with a safe fallback stack.
- Photos in rounded frames, slightly rotated or overlapping like the intro section of the reference, soft shadow.
- Floating decorative leaves, a few drops of water, small botanical line illustrations in SVG, gently animated (very slow float). Respect `prefers-reduced-motion`.
- Calm, airy, lots of whitespace, thin dividers, small pill buttons in green and black like the reference.

## Page structure (same rhythm as the reference)
1. **Header**: round green logo mark (a water drop merged with a leaf, inline SVG) and the word "Aqua" with a small line "Water assistant for farms". Centre navigation: About, Features, Crops, Advisor, Field notes, Contact. Right: a round "Log in" icon button. Sticky, cream, blurs on scroll.
2. **Hero**: full-width photo `images/jp-farmer-terrace.jpg` (farmer in a flooded terraced field at golden hour) with a soft green gradient, a vertical headline on the right in white, for example "Every drop, in its place." with a smaller vertical line "The water assistant for the farms of Tunisia". Previous/next round arrows on the left, a vertical "Scroll" cue on the right. The hero bottom is a layered wave into the cream page.
3. **Intro "Care for the land, drop by drop"**: like the reference's second block. Left: two overlapping rounded photos `images/tn-cap-bon-olive.jpg` and `images/tn-olive-dahar.jpg` with a caption chip "Tunisia". Centre: vertical heading and a short paragraph about local, practical help for farmers, with a vertical green "Learn more" pill. Right: a large rounded photo `images/jp-terraced-valley.jpg` with a caption chip "Japan". One short sentence connecting the two lands: both know how to farm where water is precious.
4. **Quick access**: a horizontal row of five icon cards with arrows, like the reference "department" strip. Items: Soil and water, Rain-aware watering, Crop guide, Advisor, Alerts. Each with a hand-drawn style SVG icon and a hover state (a small green circle behind the icon). A vertical title on the left, "Quick access".
5. **What Aqua gives you** (replaces the online shop): centred title with small subtitle, then a grid of eight soft cards (image or illustration on top, title and one short line below, no prices). Cards: Soil watch, Tank level, Rain-aware watering, Water planning, Farm map, Advisor with voice, Alerts, Team roles. Use the available photos where they fit (crop them with `object-fit`), and elegant SVG illustrations for the others. Two buttons below: "See all features" (green) and "Common questions" (black).
6. **Works everywhere** (replaces related links): wave top. Centred title "On every screen" and a carousel-style row of rounded white cards, for Web, Desktop, Android and WhatsApp, each with a simple line icon. No third-party logos.
7. **Field notes** (replaces news and events): left side an illustrated map-like organic shape in green with a location pin labelled "Tunisia" and a person illustration or the photo `images/jp-flooded-terraces.jpg` cropped into the blob shape. Right side a vertical title "Field notes" and a list of four short entries WITHOUT dates (use a small tag like Irrigation, Soil, Tank, Rain instead of a date), each a plain sentence of practical advice, with a "More notes" green pill.
8. **Footer**: dark green layered wave with contour lines, the logo, tagline, footer navigation, a "Contact" line with a mail icon only (no real address), and "Aqua" copyright WITHOUT a year.

## Behaviour
- Fully responsive (desktop first, good on phone). Mobile menu button. No horizontal scroll.
- `js/main.js`: sticky header blur, mobile menu, smooth anchor scroll, reveal-on-scroll fade up, simple working carousel arrows for the quick access and the platform rows, and a hero arrow control that crossfades between the hero photo and `images/jp-terraced-valley.jpg`.
- Accessible: semantic landmarks, alt text on every image, visible focus styles, contrast that passes, buttons are real buttons or links.
- Only use these images: `images/jp-farmer-terrace.jpg`, `images/jp-terraced-valley.jpg`, `images/jp-flooded-terraces.jpg`, `images/tn-cap-bon-olive.jpg`, `images/tn-olive-dahar.jpg`.
- Add `lazy` loading for images below the hero.

## Finish
When done, check yourself that no digits appear in visible text (CSS and code numbers are fine), and that the word "hackathon" appears nowhere in any file.

Note: you have no shell. Do not try to run commands or open a browser. Use only the file read and write tools, then check your own work by re-reading the files.
Write each file in ONE write call as soon as the plan is clear, do not re-plan at length. Write index.html first, then css/style.css, then js/main.js.

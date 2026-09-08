import { assetImageUrl } from "./asset-url.js";

export const PROJECT_SECTION_IDS = [
  "explorer",
  "research",
  "method",
  "results",
  "evidence",
  "team",
];

export const METHOD_STAGE_IDS = ["observe", "hypothesize", "explore", "pin"];

export const RECORDED_BENCHMARKS = [
  {
    id: "glm-5-3-flash-max",
    dataDirectory: "glm-5.3-flash-max",
    model: "GLM-5.3-Flash + MCP",
    reasoning: "Max",
    points: 111_161,
    maxPoints: 125_000,
    sample: "1 complete run · partial attempts excluded",
    runs: [
      { label: "Run 1", easy: 39_773, medium: 41_229, hard: 30_159, total: 111_161 },
    ],
  },
  {
    id: "gpt-6-astra-low",
    dataDirectory: "gpt-6-astra-low",
    model: "GPT-6 Astra",
    reasoning: "low",
    points: (119_160 + 119_818 + 118_759) / 3,
    maxPoints: 125_000,
    sample: "3 runs · mean score",
    runs: [
      { label: "Run 1", easy: 39_997, medium: 44_189, hard: 34_974, total: 119_160 },
      { label: "Run 2", easy: 39_998, medium: 44_686, hard: 35_134, total: 119_818 },
      { label: "Run 3", easy: 39_998, medium: 43_482, hard: 35_279, total: 118_759 },
    ],
  },
  {
    id: "gemini-3-7-flash-high-aided",
    dataDirectory: "gemini-3.7-flash-high-aided",
    model: "Gemini 3.7 Flash",
    reasoning: "high, aided",
    points: 120_029,
    maxPoints: 125_000,
    sample: "1 run",
  },
  {
    id: "gpt-5-6-sol-xhigh",
    dataDirectory: "gpt-5.6-sol-xhigh",
    model: "GPT-5.6 Sol",
    reasoning: "xhigh",
    points: (110_273 + 107_436 + 114_716) / 3,
    maxPoints: 125_000,
    sample: "3 runs · mean score",
  },
  {
    id: "gpt-5-6-sol-max",
    dataDirectory: "gpt-5.6-sol-max",
    model: "GPT-5.6 Sol",
    reasoning: "max",
    points: (107_838 + 114_794 + 111_149) / 3,
    maxPoints: 125_000,
    sample: "3 runs · mean score",
  },
  {
    id: "grok-4-6-xhigh",
    dataDirectory: "grok-4.6-xhigh",
    model: "Grok 4.6",
    reasoning: "xhigh",
    points: (80_081 + 71_562 + 73_222) / 3,
    maxPoints: 125_000,
    sample: "3 runs · mean score",
  },
  {
    id: "grok-4-6-xhigh-mcp",
    dataDirectory: "grok-4.6-xhigh",
    model: "Grok 4.6 + MCP",
    reasoning: "xhigh",
    points: 105_026,
    maxPoints: 125_000,
    sample: "3 runs per difficulty · composite mean",
  },
  {
    id: "gemini-3-7-flash-high-unaided",
    dataDirectory: "gemini-3.7-flash-high",
    model: "Gemini 3.7 Flash",
    reasoning: "high, unaided",
    points: 64_350,
    maxPoints: 125_000,
    sample: "1 run",
  },
];

export function buildProjectSnapshot(cases = [], benchmarks = RECORDED_BENCHMARKS) {
  const difficultyCounts = { easy: 0, medium: 0, hard: 0 };
  const sceneImages = {};

  for (const item of cases) {
    if (Object.hasOwn(difficultyCounts, item?.difficulty)) {
      difficultyCounts[item.difficulty] += 1;
    }
    const imageUrl = assetImageUrl(item?.startingImage);
    if (item?.id && imageUrl) sceneImages[item.id] = imageUrl;
  }

  const leaderboard = benchmarks
    .map((entry) => ({
      ...entry,
      scorePercent: roundToOne((entry.points / entry.maxPoints) * 100),
    }))
    .sort((left, right) => right.points - left.points)
    .map((entry, index) => ({ ...entry, rank: index + 1 }));

  return {
    locationCount: cases.length,
    difficultyCounts,
    sceneImages,
    leaderboard,
  };
}

export function normalizeProjectSection(value) {
  const normalized = String(value ?? "").trim().toLocaleLowerCase();
  return PROJECT_SECTION_IDS.includes(normalized) ? normalized : null;
}

export function scrollToProjectSection(root, value, { behavior = "smooth" } = {}) {
  const sectionId = normalizeProjectSection(value);
  if (!sectionId || !root?.querySelector) return false;

  const target = root.querySelector(`[data-site-section-id="${sectionId}"]`);
  if (!target?.scrollIntoView) return false;

  target.scrollIntoView({ behavior, block: "start" });
  return true;
}

export function scrollToMethodStage(root, value, { behavior = "smooth" } = {}) {
  const stageId = String(value ?? "").trim().toLocaleLowerCase();
  if (!METHOD_STAGE_IDS.includes(stageId) || !root?.querySelector) return false;

  const target = root.querySelector(`[data-method-stage-id="${stageId}"]`);
  if (!target?.scrollIntoView) return false;

  target.scrollIntoView({ behavior, block: "center" });
  target.focus?.({ preventScroll: true });
  return true;
}

export function setActiveProjectSection(root, value) {
  const sectionId = normalizeProjectSection(value);
  if (!sectionId || !root?.querySelectorAll) return false;

  root.dataset.activeSection = sectionId;
  for (const item of root.querySelectorAll("[data-story-navigation] [data-scroll-target]")) {
    const isCurrent = item.dataset.scrollTarget === sectionId;
    item.classList.toggle("is-active", isCurrent);
    if (isCurrent) item.setAttribute("aria-current", "location");
    else item.removeAttribute("aria-current");
  }
  return true;
}

export function projectSectionAtViewport(sections, anchorY) {
  let activeSection = null;
  for (const section of sections ?? []) {
    if (section.getBoundingClientRect().top > anchorY) break;
    activeSection = normalizeProjectSection(section.dataset.siteSectionId) ?? activeSection;
  }
  return activeSection;
}

export function projectStoryMarkup(snapshot = buildProjectSnapshot()) {
  const counts = snapshot.difficultyCounts ?? { easy: 0, medium: 0, hard: 0 };
  const leaderboard = snapshot.leaderboard ?? [];

  return `
    <div class="project-story" data-project-story>
      <nav class="story-nav" data-story-navigation aria-label="Project sections">
        <button class="story-nav__brand" type="button" data-scroll-target="explorer">
          <span>NAUTILUS</span>
          <small>Back to atlas</small>
        </button>
        <div class="story-nav__links">
          <button type="button" data-scroll-target="research">Question</button>
          <button type="button" data-scroll-target="method">Method</button>
          <button type="button" data-scroll-target="results">Results</button>
          <button type="button" data-scroll-target="evidence">Explainability</button>
          <button type="button" data-scroll-target="team">Team</button>
        </div>
        <a class="story-nav__github" href="https://github.com/IvanYachUkr/NAUTILUS-" target="_blank" rel="noopener noreferrer">
          <i class="ph ph-github-logo" aria-hidden="true"></i>
          <span>Source</span>
        </a>
      </nav>

      <main class="story-main">
        <section class="story-section story-intro" id="research" data-site-section-id="research">
          <div class="story-section__eyebrow"><span>01</span> The research question</div>
          <div class="story-intro__grid">
            <div>
              <p class="story-overline">Evaluating explainability and agentic exploration in MLLM image geolocation</p>
              <h2>A correct pin is<br /><em>not enough.</em></h2>
            </div>
            <div class="story-intro__copy">
              <p>NAUTILUS tests whether vision-capable models can geolocate European street scenes and show evidence that a person can actually verify.</p>
              <p>We compare the model's stated clues, its path through the panorama, and its final pin—so a confident explanation can be checked against what was visible.</p>
              <button class="story-cta story-cta--primary" type="button" data-scroll-target="explorer">
                <i class="ph-fill ph-globe-hemisphere-west" aria-hidden="true"></i>
                Explore the atlas
              </button>
            </div>
          </div>

          <div class="scene-triptych" aria-label="Representative benchmark scenes">
            <figure class="scene-frame scene-frame--wide">
              ${sceneImageMarkup(snapshot, "europe-easy--loc-001", "Paris street scene at Place de la Bastille")}
              <figcaption><span>Easy · Urban</span><strong>Paris, France</strong></figcaption>
              <button class="scene-frame__open" type="button" data-case-id="europe-easy--loc-001" aria-label="Explore Paris in the atlas"><i class="ph ph-arrow-up-right" aria-hidden="true"></i></button>
            </figure>
            <figure class="scene-frame">
              ${sceneImageMarkup(snapshot, "europe-medium--loc-009", "Residential street scene in Valencia")}
              <figcaption><span>Medium · Urban</span><strong>Valencia, Spain</strong></figcaption>
              <button class="scene-frame__open" type="button" data-case-id="europe-medium--loc-009" aria-label="Explore Valencia in the atlas"><i class="ph ph-arrow-up-right" aria-hidden="true"></i></button>
            </figure>
            <figure class="scene-frame">
              ${sceneImageMarkup(snapshot, "europe-hard--loc-018", "Rural road scene in Greece")}
              <figcaption><span>Hard · Rural</span><strong>Peloponnese, Greece</strong></figcaption>
              <button class="scene-frame__open" type="button" data-case-id="europe-hard--loc-018" aria-label="Explore Peloponnese in the atlas"><i class="ph ph-arrow-up-right" aria-hidden="true"></i></button>
            </figure>
          </div>
        </section>

        <section class="story-section method-section" id="method" data-site-section-id="method">
          <div class="story-section__eyebrow"><span>02</span> Method</div>
          <div class="story-heading-row">
            <h2>From first glance<br /><em>to final pin.</em></h2>
            <p>Every run uses the same four-stage protocol. The final prediction matters, but so does the path that produced it.</p>
          </div>

          <figure class="method-scene" aria-hidden="true">
            ${sceneImageMarkup(snapshot, "europe-medium--loc-013")}
          </figure>

          <ol class="method-steps">
            <li data-method-stage-id="observe" tabindex="-1">
              <i class="ph ph-eye" aria-hidden="true"></i>
              <span>01</span>
              <h3>Observe</h3>
              <p>Inspect the fixed starting scene and report visible geographic cues.</p>
            </li>
            <li data-method-stage-id="hypothesize" tabindex="-1">
              <i class="ph ph-lightbulb" aria-hidden="true"></i>
              <span>02</span>
              <h3>Hypothesize</h3>
              <p>State an initial country, region, or city belief before using the map.</p>
            </li>
            <li data-method-stage-id="explore" tabindex="-1">
              <i class="ph ph-path" aria-hidden="true"></i>
              <span>03</span>
              <h3>Explore</h3>
              <p>Move through the panorama, test the hypothesis, and collect more evidence.</p>
            </li>
            <li data-method-stage-id="pin" tabindex="-1">
              <i class="ph ph-map-pin-line" aria-hidden="true"></i>
              <span>04</span>
              <h3>Pin</h3>
              <p>Commit one final map prediction and compare it with ground truth.</p>
            </li>
          </ol>

          <div class="conditions-grid">
            <article class="condition-panel">
              <div class="condition-panel__number">A</div>
              <div>
                <span>Control condition</span>
                <h3>Static image</h3>
                <p>One canonical starting frame. No movement, panning, or zooming inside the street scene.</p>
              </div>
              <i class="ph ph-image" aria-hidden="true"></i>
            </article>
            <article class="condition-panel condition-panel--active">
              <div class="condition-panel__number">B</div>
              <div>
                <span>Agentic condition</span>
                <h3>Interactive panorama</h3>
                <p>The model may move, pan, and zoom before placing its pin; the full route is recorded for replay.</p>
              </div>
              <i class="ph ph-arrows-out-cardinal" aria-hidden="true"></i>
            </article>
          </div>

          <div class="protocol-grid">
            <div>
              <span class="protocol-label protocol-label--allow">Allowed</span>
              <p>Ordinary map labels, visual road comparison, panning, zooming, and a controlled interaction budget.</p>
            </div>
            <div>
              <span class="protocol-label protocol-label--block">Disabled</span>
              <p>Map search, automatic geocoding, reverse-image search, metadata access, and dedicated geolocation APIs.</p>
            </div>
          </div>
        </section>

        <section class="story-section results-section" id="results" data-site-section-id="results">
          <div class="story-section__eyebrow"><span>03</span> Recorded benchmark</div>
          <div class="story-heading-row">
            <h2>${formatInteger(snapshot.locationCount)} European scenes.<br />Three difficulty bands.</h2>
            <p>Interactive OpenGuessr results on the same fixed locations. Repeated conditions are ranked by mean points; percentages show the share of the maximum score. Controller conditions and continuation composites are labelled.</p>
          </div>

          <figure class="results-scene" aria-hidden="true">
            ${sceneImageMarkup(snapshot, "europe-easy--loc-004")}
          </figure>

          <div class="benchmark-facts" aria-label="Benchmark composition">
            <div aria-label="${formatInteger(snapshot.locationCount)} locations"><strong>${formatInteger(snapshot.locationCount)}</strong><span>locations</span></div>
            <div aria-label="${formatInteger(counts.easy)} easy locations"><strong>${formatInteger(counts.easy)}</strong><span>easy</span></div>
            <div aria-label="${formatInteger(counts.medium)} medium locations"><strong>${formatInteger(counts.medium)}</strong><span>medium</span></div>
            <div aria-label="${formatInteger(counts.hard)} hard locations"><strong>${formatInteger(counts.hard)}</strong><span>hard</span></div>
            <div aria-label="2 evaluation conditions"><strong>2</strong><span>conditions</span></div>
          </div>

          <div class="leaderboard" aria-label="Recorded benchmark leaderboard">
            <header>
              <span>Rank / model</span>
              <span>Mean points</span>
              <span>Share of 125,000</span>
            </header>
            ${leaderboard.map(leaderboardRowMarkup).join("")}
          </div>
          <p class="results-note"><i class="ph ph-info" aria-hidden="true"></i> Each condition covers 8 easy, 9 medium, and 8 hard scenes. Repeats measure variation on these fixed locations. Grok MCP combines separate difficulty means; its Easy timer was 180 seconds and Medium/Hard 300 seconds.</p>
          ${astraResultsMarkup(leaderboard.find((entry) => entry.id === "gpt-6-astra-low"))}
        </section>

        <section class="story-section evidence-section" id="evidence" data-site-section-id="evidence">
          <div class="story-section__eyebrow"><span>04</span> Explainability</div>
          <div class="evidence-grid">
            <div class="evidence-copy">
              <h2>Can the clue survive <em>inspection?</em></h2>
              <p>A polished explanation can still be wrong. Human review treats each reported clue as evidence to test, not prose to admire.</p>
              <div class="cue-rubric" aria-label="Cue review rubric">
                <span><i class="ph ph-eye" aria-hidden="true"></i> Visible</span>
                <span><i class="ph ph-check-circle" aria-hidden="true"></i> Correct</span>
                <span><i class="ph ph-crosshair" aria-hidden="true"></i> Specific</span>
                <span><i class="ph ph-compass" aria-hidden="true"></i> Useful</span>
                <span><i class="ph ph-link" aria-hidden="true"></i> Consistent</span>
              </div>
            </div>

            <article class="evidence-example">
              <div class="evidence-example__image">
                ${sceneImageMarkup(snapshot, "europe-easy--loc-001", "Bastille scene used for an evidence example")}
              </div>
              <div class="evidence-example__body">
                <span>Example evidence trace · Paris</span>
                <h3>“Bastille” appears on the transit sign.</h3>
                <p>The clue is visible in the source scene, names a precise place, and supports the final Paris hypothesis.</p>
                <div class="evidence-verdicts">
                  <b><i class="ph-fill ph-check-circle" aria-hidden="true"></i> Visible</b>
                  <b><i class="ph-fill ph-check-circle" aria-hidden="true"></i> Geographic</b>
                  <b><i class="ph-fill ph-check-circle" aria-hidden="true"></i> Pin-consistent</b>
                </div>
              </div>
            </article>
          </div>
        </section>

        <section class="story-section team-section" id="team" data-site-section-id="team">
          <div class="story-section__eyebrow"><span>05</span> The team</div>
          <figure class="team-scene" aria-hidden="true">
            ${sceneImageMarkup(snapshot, "europe-hard--loc-022")}
          </figure>
          <div class="team-layout">
            <div>
              <p class="story-overline">Multimodal AI systems · street-level geospatial analysis</p>
              <h2>Built to make model reasoning inspectable.</h2>
            </div>
            <div class="team-list" aria-label="Project team">
              <div><span>01</span><strong>Ivan Iachnyk</strong></div>
              <div><span>02</span><strong>Clemens Roßkopf</strong></div>
              <div><span>03</span><strong>Claudius Kühn</strong></div>
            </div>
          </div>

          <div class="closing-panel">
            <div>
              <span>Open the evidence</span>
              <h3>Every guess has a story.<br /><em>Go find one.</em></h3>
            </div>
            <div class="closing-panel__actions">
              <button class="story-cta story-cta--light" type="button" data-scroll-target="explorer">
                <i class="ph-fill ph-globe-hemisphere-west" aria-hidden="true"></i>
                Enter the explorer
              </button>
              <a class="story-cta story-cta--ghost" href="https://github.com/IvanYachUkr/NAUTILUS-" target="_blank" rel="noopener noreferrer">
                <i class="ph ph-github-logo" aria-hidden="true"></i>
                View on GitHub
              </a>
            </div>
          </div>
        </section>
      </main>

      <footer class="site-footer">
        <strong>NAUTILUS</strong>
        <span>Explainable · agentic image geolocation</span>
        <span>Computer Vision Project · 2026</span>
      </footer>
    </div>
  `;
}

function sceneImageMarkup(snapshot, caseId, alt = "") {
  const imageUrl = snapshot.sceneImages?.[caseId];
  if (!imageUrl) return "";
  return `<img src="${escapeMarkup(imageUrl)}" alt="${escapeMarkup(alt)}" loading="lazy" />`;
}

function leaderboardRowMarkup(entry) {
  const model = escapeMarkup(entry.model);
  const reasoning = escapeMarkup(entry.reasoning);
  const points = Number(entry.points) || 0;
  const maxPoints = Number(entry.maxPoints) || 0;

  return `
    <article class="leaderboard-row">
      <div class="leaderboard-row__model">
        <span>${String(entry.rank).padStart(2, "0")}</span>
        <div><strong>${model}</strong><small>${reasoning} reasoning · ${escapeMarkup(entry.sample ?? "1 run")}</small></div>
      </div>
      <strong class="leaderboard-row__score">${formatInteger(points)}</strong>
      <div class="leaderboard-row__progress">
        <progress value="${points}" max="${maxPoints}" aria-label="${model} score: ${formatInteger(points)} of ${formatInteger(maxPoints)}"></progress>
        <span>${Number(entry.scorePercent).toFixed(1)}%</span>
      </div>
    </article>
  `;
}

function astraResultsMarkup(entry) {
  if (!entry?.runs?.length) return "";
  return `
    <details class="benchmark-repeat-details" open>
      <summary>GPT-6 Astra · low reasoning · three runs</summary>
      <p>300 seconds per round, using Chrome screenshots and visible controls. Mean: <strong>119,245.67 / 125,000</strong> (95.3965%).</p>
      <div class="benchmark-repeat-table">
        <table aria-label="GPT-6 Astra low individual run scores">
          <thead><tr><th scope="col">Run</th><th scope="col">Easy</th><th scope="col">Medium</th><th scope="col">Hard</th><th scope="col">Total</th></tr></thead>
          <tbody>${entry.runs.map((run) => `<tr><th scope="row">${escapeMarkup(run.label)}</th><td>${formatInteger(run.easy)}</td><td>${formatInteger(run.medium)}</td><td>${formatInteger(run.hard)}</td><td><strong>${formatInteger(run.total)}</strong></td></tr>`).join("")}</tbody>
        </table>
      </div>
      <p>Run 1 Hard and Run 3 Medium combine completed round results with official continuation leaderboards after interruptions. The contaminated Medium attempt and the unverified crash round are excluded.</p>
      <p><a href="https://github.com/IvanYachUkr/NAUTILUS-/tree/main/demo_and_extension/data/recorded-agent-benchmark/gpt-6-astra-low" target="_blank" rel="noopener noreferrer">Reports, scores and screenshot evidence <span aria-hidden="true">↗</span></a>. Videos remain local. Astra prediction coordinates still require validation, so its results are shown here without globe pins.</p>
    </details>
  `;
}

function formatInteger(value) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(Number(value) || 0);
}

function escapeMarkup(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function roundToOne(value) {
  return Math.round(value * 10) / 10;
}

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
    id: "gpt-5-6-sol-xhigh",
    dataDirectory: "gpt-5.6-sol-xhigh",
    model: "GPT-5.6 Sol",
    reasoning: "xhigh",
    points: 110_273,
    maxPoints: 125_000,
  },
  {
    id: "gpt-5-6-sol-max",
    dataDirectory: "gpt-5.6-sol-max",
    model: "GPT-5.6 Sol",
    reasoning: "max",
    points: 107_838,
    maxPoints: 125_000,
  },
  {
    id: "grok-4-6-xhigh",
    dataDirectory: "grok-4.6-xhigh",
    model: "Grok 4.6",
    reasoning: "xhigh",
    points: 80_081,
    maxPoints: 125_000,
  },
];

export function buildProjectSnapshot(cases = [], benchmarks = RECORDED_BENCHMARKS) {
  const difficultyCounts = { easy: 0, medium: 0, hard: 0 };

  for (const item of cases) {
    if (Object.hasOwn(difficultyCounts, item?.difficulty)) {
      difficultyCounts[item.difficulty] += 1;
    }
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
              <img src="./data/starting-images/europe-easy/loc_001.png" alt="Paris street scene at Place de la Bastille" loading="lazy" />
              <figcaption><span>Easy · Urban</span><strong>Paris, France</strong></figcaption>
              <button class="scene-frame__open" type="button" data-case-id="europe-easy--loc-001" aria-label="Explore Paris in the atlas"><i class="ph ph-arrow-up-right" aria-hidden="true"></i></button>
            </figure>
            <figure class="scene-frame">
              <img src="./data/starting-images/europe-medium/loc_009.png" alt="Residential street scene in Valencia" loading="lazy" />
              <figcaption><span>Medium · Urban</span><strong>Valencia, Spain</strong></figcaption>
              <button class="scene-frame__open" type="button" data-case-id="europe-medium--loc-009" aria-label="Explore Valencia in the atlas"><i class="ph ph-arrow-up-right" aria-hidden="true"></i></button>
            </figure>
            <figure class="scene-frame">
              <img src="./data/starting-images/europe-hard/loc_018.png" alt="Rural road scene in Greece" loading="lazy" />
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
            <img src="./data/starting-images/europe-medium/loc_013.png" alt="" loading="lazy" />
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
            <p>The current public benchmark contains complete recorded interactive runs. Scores below are official OpenGuessr competition points—not accuracy percentages or transient XP.</p>
          </div>

          <figure class="results-scene" aria-hidden="true">
            <img src="./data/starting-images/europe-easy/loc_004.png" alt="" loading="lazy" />
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
              <span>Official points</span>
              <span>Share of 125,000</span>
            </header>
            ${leaderboard.map(leaderboardRowMarkup).join("")}
          </div>
          <p class="results-note"><i class="ph ph-info" aria-hidden="true"></i> Each entry covers the same 25 scenes: 8 easy, 9 medium, and 8 hard rounds. The explorer keeps model beliefs, pin coordinates, and controller failures visible rather than silently correcting them.</p>
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
                <img src="./data/starting-images/europe-easy/loc_001.png" alt="Bastille scene used for an evidence example" loading="lazy" />
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
            <img src="./data/starting-images/europe-hard/loc_022.png" alt="" loading="lazy" />
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

function leaderboardRowMarkup(entry) {
  const model = escapeMarkup(entry.model);
  const reasoning = escapeMarkup(entry.reasoning);
  const points = Number(entry.points) || 0;
  const maxPoints = Number(entry.maxPoints) || 0;

  return `
    <article class="leaderboard-row">
      <div class="leaderboard-row__model">
        <span>${String(entry.rank).padStart(2, "0")}</span>
        <div><strong>${model}</strong><small>${reasoning} reasoning · 25 recorded rounds</small></div>
      </div>
      <strong class="leaderboard-row__score">${formatInteger(points)}</strong>
      <div class="leaderboard-row__progress">
        <progress value="${points}" max="${maxPoints}" aria-label="${model} score: ${formatInteger(points)} of ${formatInteger(maxPoints)}"></progress>
        <span>${Number(entry.scorePercent).toFixed(1)}%</span>
      </div>
    </article>
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

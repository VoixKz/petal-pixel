import { Component, lazy, Suspense, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { GROWERS, STAGES, stageAt, type Grower } from "./growers";

const GrowStage = lazy(() => import("./GrowStage"));

/** Choosing a flower starts it at the bud, so the bloom is not a long wait. */
const BUD_LIFE = 0.34;
const SECONDS_PER_LIFE_TO_BUD = 14;
const SECONDS_PER_LIFE_IN_BLOOM = 13;

function hasWebGL(): boolean {
  try {
    return Boolean(document.createElement("canvas").getContext("webgl2"));
  } catch {
    return false;
  }
}

const wantsLessMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * Keeps the control in focus in sight. On a small screen the plant holds at the top, and
 * the browser's own scrolling doesn't count it as covering anything, so this works it out.
 */
function bringIntoSight(control: HTMLElement, stage: HTMLElement | null) {
  const row = control.closest<HTMLElement>(".grow__picks");
  if (row) {
    const box = control.getBoundingClientRect();
    const middle = box.left - row.getBoundingClientRect().left + box.width / 2;
    row.scrollLeft += middle - row.clientWidth / 2;
  }
  const holding = stage && getComputedStyle(stage).position === "sticky";
  if (!holding) return;
  const covered = stage.getBoundingClientRect().bottom + 12 - control.getBoundingClientRect().top;
  if (covered > 0) window.scrollBy({ top: -covered, behavior: "instant" });
}
const stillOfGrower = (grower: Grower) => `/flowers/grow/${grower.id}.webp`;

/** A flower that cannot load leaves its picture on the page, and the rest keeps working. */
class StageGuard extends Component<{ flower: string; onFail: () => void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch() {
    this.props.onFail();
  }

  componentDidUpdate(previous: { flower: string }) {
    if (previous.flower !== this.props.flower && this.state.failed) this.setState({ failed: false });
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}

export function Grow() {
  const section = useRef<HTMLElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const slider = useRef<HTMLInputElement>(null);
  const life = useRef({ value: 0 }).current;
  const glow = useRef({ value: 0 }).current;
  const playing = useRef(false);
  const started = useRef(false);

  const [grower, setGrower] = useState<Grower>(GROWERS[0]);
  const [variant, setVariant] = useState(0);
  const [night, setNight] = useState(false);
  const [visible, setVisible] = useState(false);
  const [near, setNear] = useState(false);
  const [drawn, setDrawn] = useState(false);
  const [scanLoading, setScanLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [webgl] = useState(hasWebGL);

  const show = useCallback(() => {
    if (!slider.current) return;
    slider.current.value = String(Math.round(life.value * 100));
    slider.current.setAttribute("aria-valuetext", stageAt(life.value));
  }, [life]);

  const growFrom = useCallback(
    (start: number) => {
      const jump = wantsLessMotion();
      life.value = jump ? 1 : start;
      playing.current = !jump;
      show();
    },
    [life, show],
  );

  useEffect(() => {
    const el = section.current;
    if (!el || !("IntersectionObserver" in window)) {
      setNear(true);
      setVisible(true);
      return;
    }
    const nearby = new IntersectionObserver(([entry]) => entry.isIntersecting && setNear(true), { rootMargin: "100% 0px" });
    const inView = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), { threshold: 0.3 });
    nearby.observe(el);
    inView.observe(el);
    return () => {
      nearby.disconnect();
      inView.disconnect();
    };
  }, []);

  // The first time the section comes into view the flower grows by itself.
  useEffect(() => {
    if (!visible || started.current) return;
    started.current = true;
    growFrom(0);
  }, [visible, growFrom]);

  useEffect(() => {
    if (!visible) return;
    let frame = 0;
    let last = performance.now();
    const tick = (now: number) => {
      // A slow device gets fewer frames, not a slower plant; only a long pause is cut short.
      const seconds = Math.min((now - last) / 1000, 0.5);
      last = now;
      if (playing.current) {
        const pace = life.value < 0.44 ? SECONDS_PER_LIFE_TO_BUD : SECONDS_PER_LIFE_IN_BLOOM;
        life.value = Math.min(1, life.value + seconds / pace);
        show();
        if (life.value >= 1) playing.current = false;
      }
      glow.value += ((night ? 1 : 0) - glow.value) * (1 - Math.exp(-seconds * 3.2));
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [visible, night, life, glow, show]);

  const choose = (next: Grower) => {
    setGrower(next);
    setVariant(0);
    setFailed(false);
    if (next.id !== grower.id) setScanLoading(Boolean(next.scan));
    growFrom(BUD_LIFE);
  };
  const onDrawn = useCallback(() => setDrawn(true), []);
  const onScanReady = useCallback(() => setScanLoading(false), []);
  const onFail = useCallback(() => {
    setScanLoading(false);
    setFailed(true);
  }, []);

  const live = webgl && !failed;
  let note = grower.note ?? "Drag the flower to turn it.";
  if (!webgl) note = "This browser cannot draw the plant, so here is each flower fully open.";
  else if (failed) note = "This flower did not load. Pick another one.";
  else if (scanLoading) note = "Loading the scan.";

  return (
    <section className="grow" id="grow" ref={section} data-night={night}>
      <div className="grow__head">
        <h2 className="rise">Watch one grow.</h2>
        <p className="grow__lead rise">
          Eight kinds of flower a name can grow, and one real orchid. Drag the slider, then turn the lights off and the
          colour comes from inside.
        </p>
      </div>

      <div ref={stage} className="grow__stage" role="img" aria-label={`${grower.label}, growing from soil to full bloom`}>
        <img
          className="grow__poster"
          src={stillOfGrower(grower)}
          alt=""
          width={480}
          height={480}
          data-hidden={live && drawn}
        />
        {webgl && near && (
          <StageGuard flower={grower.id} onFail={onFail}>
            <Suspense fallback={null}>
              <GrowStage
                grower={grower}
                seed={`grow-${grower.id}-${variant}`}
                life={life}
                glow={glow}
                night={night}
                active={visible}
                onReady={onDrawn}
                onScanReady={onScanReady}
              />
            </Suspense>
          </StageGuard>
        )}
      </div>

      <div className="grow__controls" onFocus={(event) => bringIntoSight(event.target, stage.current)}>
        <div className="grow__picks rise" role="group" aria-label="Flower">
          {GROWERS.map((item) => (
            <button
              key={item.id}
              type="button"
              className="grow__pick"
              aria-pressed={item.id === grower.id}
              onClick={() => choose(item)}
            >
              <img src={stillOfGrower(item)} alt="" loading="lazy" width={480} height={480} />
              <span>{item.label}</span>
            </button>
          ))}
        </div>

        {live && (
          <div className="grow__age rise">
            <input
              ref={slider}
              type="range"
              min={0}
              max={100}
              defaultValue={0}
              aria-label="Age of the plant"
              onChange={(event) => {
                playing.current = false;
                life.value = Number(event.target.value) / 100;
                show();
              }}
            />
            <div className="grow__stages" aria-hidden="true">
              {STAGES.map((stage) => (
                <span key={stage.label} style={{ left: `${stage.at * 100}%` }}>{stage.label}</span>
              ))}
            </div>
          </div>
        )}

        {live && (
          <div className="grow__actions rise">
            <button type="button" className="pp-button" onClick={() => growFrom(0)}>Grow again</button>
            <button type="button" className="pp-button pp-button--quiet" onClick={() => setNight((on) => !on)}>
              {night ? "Turn the lights on" : "Turn the lights off"}
            </button>
            {!grower.scan && (
              <button type="button" className="pp-button pp-button--quiet" onClick={() => setVariant((n) => n + 1)}>
                Another colour
              </button>
            )}
          </div>
        )}

        <p className="grow__note" aria-live="polite">{note}</p>
      </div>
    </section>
  );
}

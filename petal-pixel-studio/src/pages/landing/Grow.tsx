import { Component, lazy, Suspense, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { identityOf } from "@/math/blossom/identity";
import { STAGES, stageAt } from "./growers";
import { hasWebGL, picture, type GrownFlower } from "./specimens";

const GrowStage = lazy(() => import("./GrowStage"));

const SECONDS_PER_LIFE_TO_BUD = 14;
const SECONDS_PER_LIFE_IN_BLOOM = 13;

const wantsLessMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * Keeps the control in focus in sight. On a small screen the plant holds at the top, and
 * the browser's own scrolling doesn't count it as covering anything, so this works it out.
 */
function bringIntoSight(control: HTMLElement, stage: HTMLElement | null) {
  const holding = stage && getComputedStyle(stage).position === "sticky";
  if (!holding) return;
  const covered = stage.getBoundingClientRect().bottom + 12 - control.getBoundingClientRect().top;
  if (covered > 0) window.scrollBy({ top: -covered, behavior: "instant" });
}

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

/** The flower the visitor grew at the top of the page, from bare soil to full bloom. */
export function Grow({ flower }: { flower: GrownFlower }) {
  const section = useRef<HTMLElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const slider = useRef<HTMLInputElement>(null);
  const life = useRef({ value: 0 }).current;
  const glow = useRef({ value: 0 }).current;
  const playing = useRef(false);
  const started = useRef(false);

  const [night, setNight] = useState(false);
  const [visible, setVisible] = useState(false);
  const [near, setNear] = useState(false);
  const [drawn, setDrawn] = useState(false);
  const [headLoading, setHeadLoading] = useState(false);
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

  // A new name starts over from bare soil, and grows when it can be seen.
  const growing = useRef(flower.seed);
  useEffect(() => {
    if (growing.current === flower.seed) return;
    growing.current = flower.seed;
    started.current = false;
    playing.current = false;
    life.value = 0;
    show();
    setFailed(false);
    setHeadLoading(near);
  }, [flower.seed, near, life, show]);

  useEffect(() => {
    if (!visible || started.current) return;
    started.current = true;
    growFrom(0);
  }, [visible, growFrom, flower.seed]);

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

  const onDrawn = useCallback(() => setDrawn(true), []);
  const onHeadReady = useCallback(() => setHeadLoading(false), []);
  const onFail = useCallback(() => {
    setHeadLoading(false);
    setFailed(true);
  }, []);

  const { species, kind } = identityOf(flower.name);
  const whose = `${flower.name}'s ${kind}`;
  const indefinite = `a ${kind}`;
  const live = webgl && !failed;
  let note = "Drag the flower to turn it.";
  if (!webgl) note = `This browser cannot draw the plant, so here is ${indefinite} fully open.`;
  else if (failed) note = "This flower did not load. Grow it again at the top of the page.";
  else if (headLoading) note = "Loading the flower.";

  return (
    <section className="grow" id="grow" ref={section} data-night={night}>
      <div className="grow__head">
        <h2 className="rise">Watch it grow.</h2>
        <p className="grow__lead rise">
          This is {whose}, from bare soil to full bloom. Drag the slider, then turn the lights off and the colour comes from inside.
        </p>
      </div>

      <div ref={stage} className="grow__stage" role="img" aria-label={`${whose}, growing from soil to full bloom`}>
        <img
          className="grow__poster"
          src={picture(`/flowers/grow/${species.id}.webp`)}
          alt=""
          width={480}
          height={480}
          data-hidden={live && drawn}
        />
        {webgl && near && (
          <StageGuard flower={flower.seed} onFail={onFail}>
            <Suspense fallback={null}>
              <GrowStage
                seed={flower.seed}
                life={life}
                glow={glow}
                night={night}
                active={visible}
                onReady={onDrawn}
                onHeadReady={onHeadReady}
                onHeadFailed={onFail}
              />
            </Suspense>
          </StageGuard>
        )}
      </div>

      <div className="grow__controls" onFocus={(event) => bringIntoSight(event.target, stage.current)}>
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
          </div>
        )}

        <p className="grow__note" aria-live="polite">{note}</p>
      </div>
    </section>
  );
}

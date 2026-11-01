import { lazy, Suspense, useEffect, useRef, useState, type FormEvent } from "react";
import { createFlowerViaGrpc } from "@/integrations/flowerBackend/client";
import { toV2Params, type V2Params } from "@/math/flowerGeometry";
import { inkFor, plainFamily, SPECIMENS, stillOf } from "./specimens";

const GrowingFlower = lazy(() =>
  import("@/components/flower/GrowingFlower").then((m) => ({ default: m.GrowingFlower })),
);

const FIRST_NAME = "Dana";
/** How far a new flower opens by itself. On a held stage the scroll opens the rest. */
const RESTING_GROWTH = 0.58;
const opensByItself = () => window.matchMedia("(max-width: 900px)").matches;
const GROW_MS = 3800;

const NOTES = [
  "Type any name. It grows from a bud in front of you, and the same name always grows the same flower.",
  "The letters are all it needs. They set the family, the colours and every petal.",
  "Once it opens it's yours. Keep it in your garden or send it to the person it's named after.",
];

const article = (word: string) => (/^[aeiou]/i.test(word) ? "an" : "a");

interface HeroProps {
  name: string;
  onGrown: (name: string, stops: string[]) => void;
}

export function Hero({ name, onGrown }: HeroProps) {
  const reduceMotion = useRef(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  const section = useRef<HTMLElement>(null);
  const slider = useRef<HTMLInputElement>(null);
  const field = useRef<HTMLInputElement>(null);
  const growth = useRef({ value: 0 });
  const base = useRef(0);
  const held = useRef(0);
  const animation = useRef(0);

  const [draft, setDraft] = useState("");
  const [params, setParams] = useState<V2Params | null>(null);
  const [shownName, setShownName] = useState("");
  const [family, setFamily] = useState("");
  const [canvasReady, setCanvasReady] = useState(false);
  const [poster, setPoster] = useState("/flowers/hero.webp");
  const [problem, setProblem] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState(0);
  const [onScreen, setOnScreen] = useState(true);

  const apply = () => {
    const opened = base.current + (1 - base.current) * held.current;
    growth.current.value = opened;
  };

  const setBase = (value: number) => {
    base.current = value;
    if (slider.current) slider.current.value = String(value);
    apply();
  };

  const growTo = (target: number) => {
    cancelAnimationFrame(animation.current);
    if (reduceMotion.current) {
      setBase(target);
      return;
    }
    const from = base.current;
    const started = performance.now();
    const step = (now: number) => {
      const t = Math.min((now - started) / GROW_MS, 1);
      setBase(from + (target - from) * (1 - (1 - t) ** 3));
      if (t < 1) animation.current = requestAnimationFrame(step);
    };
    animation.current = requestAnimationFrame(step);
  };

  const grow = async (wanted: string, asked = true) => {
    const clean = wanted.trim();
    if (!clean) return;
    setBusy(true);
    setProblem("");
    try {
      const response = await createFlowerViaGrpc(clean);
      if (!response.params) throw new Error("empty response");
      const v2 = toV2Params(response.params);
      setParams(v2);
      setShownName(clean);
      setFamily(plainFamily(v2.family));
      onGrown(clean, (v2.palette?.stops ?? []).map((s) => s.hex));
      setBase(0);
      growTo(opensByItself() ? 1 : RESTING_GROWTH);
    } catch {
      if (asked) setProblem("That didn't grow. Check your connection and try again.");
      // The first flower is the page's own: show it open rather than a bud that never grows.
      else setPoster("/flowers/dana.webp");
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    void grow(name || FIRST_NAME, Boolean(name));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name]);

  useEffect(() => () => cancelAnimationFrame(animation.current), []);

  useEffect(() => {
    const onScroll = () => {
      const el = section.current;
      if (!el) return;
      const room = el.offsetHeight - window.innerHeight;
      // On a phone the hero is not held, so scrolling past it must not open the flower.
      const progress = room > 200 ? Math.min(Math.max(-el.getBoundingClientRect().top / room, 0), 1) : 0;
      held.current = progress;
      apply();
      setNote(progress < 0.34 ? 0 : progress < 0.72 ? 1 : 2);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    const el = section.current;
    if (!el || !("IntersectionObserver" in window)) return;
    const observer = new IntersectionObserver(([entry]) => setOnScreen(entry.isIntersecting));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (draft.trim()) void grow(draft);
    else field.current?.focus();
  };

  return (
    <section ref={section} className="hero" aria-label="Grow a flower from a name">
      <div className="hero__stage">
        <h1 className="hero__title">
          <span className="hero__half hero__half--first">
            Every <br />
            name{" "}
          </span>
          <span className="hero__half hero__half--last">
            is a <br />
            flower.
          </span>
        </h1>

        <div className="hero__centre">
          <div className="hero__sliver hero__sliver--above" aria-hidden="true">
            <img src={stillOf(SPECIMENS[2])} alt="" />
          </div>
          <div className="studio" data-ui>
            <div className="studio__view">
              <img
                className="studio__poster"
                data-gone={canvasReady && params ? "true" : "false"}
                src={poster}
                alt="A dahlia grown from the name Dana"
                width={900}
                height={900}
              />
              <Suspense fallback={null}>
                <GrowingFlower
                  params={params}
                  growth={growth.current}
                  active={onScreen}
                  onReady={() => setCanvasReady(true)}
                />
              </Suspense>
              <p className="studio__result" aria-live="polite">
                {shownName ? `${shownName} grows ${article(family)} ${family}.` : " "}
              </p>
            </div>
            <div className="studio__controls">
              <form className="studio__form" onSubmit={submit}>
                <input
                  ref={field}
                  className="studio__input"
                  aria-label="A name to grow"
                  placeholder="Type a name"
                  maxLength={64}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                />
                <button className="pp-button" type="submit" disabled={busy}>
                  {busy ? "Growing" : "Grow it"}
                </button>
              </form>
              <label className="studio__slider">
                <span>Bud</span>
                <input
                  ref={slider}
                  type="range"
                  min={0}
                  max={1}
                  step={0.001}
                  defaultValue={0}
                  aria-label="How far the flower has opened"
                  onChange={(e) => {
                    cancelAnimationFrame(animation.current);
                    setBase(Number(e.target.value));
                  }}
                />
                <span>Bloom</span>
              </label>
              {problem && <p className="studio__error" role="alert">{problem}</p>}
            </div>
          </div>
          <div className="hero__sliver hero__sliver--below" aria-hidden="true">
            <img src={stillOf(SPECIMENS[1])} alt="" />
          </div>
        </div>

        <div className="hero__note">
          <p key={note}>{NOTES[note]}</p>
        </div>
      </div>
    </section>
  );
}

/** The colour the page takes from a flower's palette. */
export function accentFrom(stops: string[]): { accent: string; onAccent: string } | null {
  // The middle stop is the colour a flower reads as; the last one mostly sits in its shadows.
  const accent = stops[Math.floor(stops.length / 2)];
  return accent ? { accent, onAccent: inkFor(accent) } : null;
}

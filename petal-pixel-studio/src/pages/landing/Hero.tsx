import { lazy, Suspense, useEffect, useRef, useState, type CSSProperties, type FormEvent } from "react";
import { identityOf } from "@/math/blossom/identity";
import { FIRST_NAME, hasWebGL, inkFor, picture, type GrownFlower } from "./specimens";

const HeroStage = lazy(() => import("./HeroStage"));

/** How far a new flower grows by itself. On a held stage the scroll opens the rest. */
const RESTING_LIFE = 0.62;
/** The first flower starts on its stem, so the page never opens on bare soil. */
const FIRST_LIFE = 0.3;
const SECONDS_TO_REST = 7;

const opensByItself = () => window.matchMedia("(max-width: 900px)").matches;

const NOTES = [
  "Type any name and it grows from the soil, the same flower every time. Scroll and it opens.",
  "The letters are all it needs. They set the kind of flower, its colour and how it opens.",
  "Once it opens it's yours. Send it to the person it's named after, or keep it in your garden.",
];

/** A flower can be sent as a link. The name stays after the #, so it never reaches a server. */
const linkFor = (name: string) => `${window.location.origin}/#name=${encodeURIComponent(name)}`;
const nameInLink = () => new URLSearchParams(window.location.hash.slice(1)).get("name") ?? "";

const article = (word: string) => (/^[aeiou]/i.test(word) ? "an" : "a");

/** How wide some words of the headline are, in units of its own font size. */
function widthInEm(words: string): number {
  try {
    const context = document.createElement("canvas").getContext("2d") as CanvasRenderingContext2D;
    context.font = '500 100px "Hanken Grotesk", sans-serif';
    return (context.measureText(words).width * 0.97) / 100;
  } catch {
    return words.length * 0.52;
  }
}

interface HeroProps {
  name: string;
  onGrown: (flower: GrownFlower, colours: readonly string[]) => void;
}

export function Hero({ name, onGrown }: HeroProps) {
  const reduceMotion = useRef(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  const section = useRef<HTMLElement>(null);
  const field = useRef<HTMLInputElement>(null);
  const life = useRef({ value: FIRST_LIFE }).current;
  const base = useRef(FIRST_LIFE);
  const held = useRef(0);
  const animation = useRef(0);

  const [draft, setDraft] = useState("");
  const [seed, setSeed] = useState("");
  const [shown, setShown] = useState("");
  const [sentence, setSentence] = useState("");
  const [sent, setSent] = useState("");
  const [canvasReady, setCanvasReady] = useState(false);
  const [note, setNote] = useState(0);
  const [onScreen, setOnScreen] = useState(true);
  const [webgl] = useState(hasWebGL);
  const [lost, setLost] = useState(false);
  /** Set once the flower on screen is one the visitor asked for, not the page's first. */
  const [own, setOwn] = useState<{ name: string; kind: string } | null>(null);

  useEffect(() => setLost(false), [seed]);

  const apply = () => {
    life.value = base.current + (1 - base.current) * held.current;
  };

  const growFrom = (start: number) => {
    cancelAnimationFrame(animation.current);
    const target = opensByItself() ? 1 : RESTING_LIFE;
    if (reduceMotion.current) {
      base.current = 1;
      apply();
      return;
    }
    base.current = start;
    let last = performance.now();
    const step = (now: number) => {
      // A slow device gets fewer frames, not a slower plant; only a long pause is cut short.
      const seconds = Math.min((now - last) / 1000, 0.5);
      last = now;
      base.current = Math.min(base.current + (seconds * RESTING_LIFE) / SECONDS_TO_REST, target);
      apply();
      if (base.current < target) animation.current = requestAnimationFrame(step);
    };
    animation.current = requestAnimationFrame(step);
  };

  const grow = (wanted: string, start: number) => {
    const clean = wanted.trim();
    if (!clean) return;
    const flower = identityOf(clean);
    setSeed(flower.seed);
    setShown(clean);
    setSent("");
    setSentence(`${clean} grows ${article(flower.kind)} ${flower.kind}.`);
    setOwn(clean === FIRST_NAME && start === FIRST_LIFE ? null : { name: clean, kind: flower.kind });
    onGrown({ name: clean, seed: flower.seed, species: flower.kind }, flower.colour);
    growFrom(start);
  };

  useEffect(() => {
    const wanted = name || nameInLink();
    setDraft("");
    grow(wanted || FIRST_NAME, wanted ? 0 : FIRST_LIFE);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name]);

  const send = async () => {
    const link = linkFor(shown);
    window.history.replaceState(null, "", `#name=${encodeURIComponent(shown)}`);
    try {
      if (navigator.share) await navigator.share({ title: sentence, url: link });
      else await navigator.clipboard.writeText(link);
      setSent(navigator.share ? "" : "Link copied. It opens on this flower.");
    } catch (error) {
      // Closing the share sheet is not a failure.
      if ((error as Error).name !== "AbortError") setSent("Couldn't copy it. The link is in the address bar.");
    }
  };

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    if (draft.trim()) grow(draft, 0);
    else field.current?.focus();
  };

  return (
    <section ref={section} className="hero" aria-label="Grow a flower from a name">
      <div className="hero__stage">
        <div className="hero__plant" role="img" aria-label={sentence || "A flower growing from the soil"}>
          <img
            className="hero__poster"
            data-gone={canvasReady && webgl ? "true" : "false"}
            src={picture("/flowers/first.webp")}
            alt=""
            width={1600}
            height={1000}
          />
          {webgl && seed && (
            <Suspense fallback={null}>
              <HeroStage
                seed={seed}
                life={life}
                active={onScreen}
                onReady={() => setCanvasReady(true)}
                onLost={() => {
                  setCanvasReady(true);
                  setLost(true);
                }}
              />
            </Suspense>
          )}
        </div>

        {own ? (
          // Sized to the words themselves, so any name stands where "Every name" stood.
          <h1
            key={`${own.name}${own.kind}`}
            className="hero__title hero__title--own"
            style={
              {
                "--wide-em": Math.max(widthInEm(own.name), widthInEm(`${own.kind}.`)),
                "--narrow-em": Math.max(widthInEm(own.name), widthInEm(`is ${article(own.kind)} ${own.kind}.`)),
              } as CSSProperties
            }
          >
            <span className="hero__half hero__half--first">{own.name} </span>
            <span className="hero__half hero__half--last">
              is {article(own.kind)} <br />
              {own.kind}.
            </span>
          </h1>
        ) : (
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
        )}

        <div className="hero__note">
          <p key={note}>{webgl ? NOTES[note] : "This browser cannot draw the plant. The flowers further down were grown from names in just the same way."}</p>
        </div>

        {webgl && (
          <div className="hero__grow">
            <p className="hero__says" aria-live="polite">{lost ? "This flower did not load. Grow it again in a moment." : sent}</p>
            {!own && !lost && !sent && <p className="hero__says">This is {FIRST_NAME}'s {identityOf(FIRST_NAME).kind}. Try your own name.</p>}
            {own && (
              <div className="hero__next">
                <button type="button" className="pp-button pp-button--quiet" onClick={() => void send()}>Send it</button>
                <a className="pp-button" href="#save">Keep it</a>
              </div>
            )}
            <form className="hero__form" onSubmit={submit}>
              <input
                ref={field}
                id="name-field"
                className="field"
                aria-label="A name to grow"
                placeholder="Type a name"
                maxLength={64}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
              />
              <button className={own ? "pp-button pp-button--quiet" : "pp-button"} type="submit">Grow it</button>
            </form>
          </div>
        )}
      </div>
    </section>
  );
}

/** The colour the page takes from a flower: its middle one is the one it reads as. */
export function accentFrom(colours: readonly string[]): { accent: string; onAccent: string } | null {
  const accent = colours[Math.floor(colours.length / 2)];
  return accent ? { accent, onAccent: inkFor(accent) } : null;
}

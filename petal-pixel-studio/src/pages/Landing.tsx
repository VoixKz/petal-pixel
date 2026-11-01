import { useCallback, useEffect, useRef, useState, type MouseEvent } from "react";
import { Link } from "react-router-dom";
import "@/styles/petal.css";
import { Grow } from "./landing/Grow";
import { accentFrom, Hero } from "./landing/Hero";
import { Close, Foot, How, Keep, Names, Questions } from "./landing/Sections";
import { FIRST_NAME, FIRST_SEED, type GrownFlower } from "./landing/specimens";

export default function Landing() {
  const root = useRef<HTMLDivElement>(null);
  const [wanted, setWanted] = useState("");
  const [grown, setGrown] = useState<GrownFlower>({ name: FIRST_NAME, seed: FIRST_SEED, species: "dahlia" });

  const onGrown = useCallback((flower: GrownFlower, colours: readonly string[]) => {
    setGrown(flower);
    const accent = accentFrom(colours);
    if (accent && root.current) {
      root.current.style.setProperty("--accent", accent.accent);
      root.current.style.setProperty("--on-accent", accent.onAccent);
    }
  }, []);

  const pick = useCallback((name: string) => {
    setWanted(name);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  const backToTheName = (event: MouseEvent) => {
    event.preventDefault();
    window.scrollTo({ top: 0, behavior: "smooth" });
    // On a touch screen this would open the keyboard, which nobody asked for.
    if (window.matchMedia("(hover: hover)").matches) document.getElementById("name-field")?.focus({ preventScroll: true });
  };

  useEffect(() => {
    const el = root.current;
    if (!el || !("IntersectionObserver" in window)) return;
    el.dataset.motion = "on";
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            (entry.target as HTMLElement).dataset.in = "true";
            observer.unobserve(entry.target);
          }
        }
      },
      { rootMargin: "0px 0px -8% 0px" },
    );
    el.querySelectorAll(".rise").forEach((item) => observer.observe(item));
    return () => observer.disconnect();
  }, []);

  return (
    <div className="pp" ref={root}>
      <header className="pp-bar">
        <Link className="pp-bar__mark" to="/" onClick={backToTheName}>Petal Pixel</Link>
        <nav className="pp-bar__links" aria-label="Main">
          <a href="#grow">Grow</a>
          <a href="#flowers">Flowers</a>
          <a href="#how">How it works</a>
          <a href="#questions">Questions</a>
          <Link className="pp-button" to="/console">Your garden</Link>
        </nav>
      </header>
      <main>
        <Hero name={wanted} onGrown={onGrown} />
        <Grow />
        <Names onPick={pick} />
        <How />
        <Keep />
        <Questions />
        <Close flower={grown} />
      </main>
      <Foot />
    </div>
  );
}

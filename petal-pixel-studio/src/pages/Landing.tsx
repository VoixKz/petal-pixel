import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import "@/styles/petal.css";
import { accentFrom, Hero } from "./landing/Hero";
import { Close, Foot, How, Keep, Names, Questions } from "./landing/Sections";

export default function Landing() {
  const root = useRef<HTMLDivElement>(null);
  const [wanted, setWanted] = useState("");
  const [grown, setGrown] = useState("Dana");

  const onGrown = useCallback((name: string, stops: string[]) => {
    setGrown(name);
    const colours = accentFrom(stops);
    if (colours && root.current) {
      root.current.style.setProperty("--accent", colours.accent);
      root.current.style.setProperty("--on-accent", colours.onAccent);
    }
  }, []);

  const pick = useCallback((name: string) => {
    setWanted(name);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

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
        <Link className="pp-bar__mark" to="/">Petal Pixel</Link>
        <nav className="pp-bar__links" aria-label="Main">
          <a href="#flowers">Flowers</a>
          <a href="#how">How it works</a>
          <a href="#questions">Questions</a>
          <Link className="pp-button" to="/console">Open console</Link>
        </nav>
      </header>
      <main>
        <Hero name={wanted} onGrown={onGrown} />
        <Names onPick={pick} />
        <How />
        <Keep />
        <Questions />
        <Close name={grown} />
      </main>
      <Foot />
    </div>
  );
}

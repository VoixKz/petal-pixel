import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { SPECIMENS, stillOf, type Specimen } from "./specimens";

const DANA = SPECIMENS.find((s) => s.name === "Dana") as Specimen;
const ANNA = SPECIMENS[0];
const BEN = SPECIMENS[1];
const ZARA = SPECIMENS[2];

function Tile({ specimen, onPick, delay }: { specimen: Specimen; onPick: (name: string) => void; delay: number }) {
  return (
    <button
      type="button"
      className="tile rise"
      style={{ "--rise-delay": `${delay}ms` } as React.CSSProperties}
      onClick={() => onPick(specimen.name)}
      aria-label={`Grow ${specimen.name}'s ${specimen.family}`}
    >
      <span className="tile__picture">
        <img src={stillOf(specimen)} alt="" loading="lazy" width={800} height={800} />
      </span>
      <span className="tile__strip">
        <span className="tile__name">{specimen.name}</span>
        <span>{specimen.family}</span>
      </span>
    </button>
  );
}

export function Names({ onPick }: { onPick: (name: string) => void }) {
  return (
    <section className="names" id="flowers">
      <div className="names__grid">
        <div className="names__intro rise">
          <h2>Same name, same flower.</h2>
          <p>
            These are real flowers from nine names, one for each family. Grow any of them again and you get exactly
            this flower, on any device, for anyone.
          </p>
        </div>
        {SPECIMENS.map((specimen, i) => (
          <Tile key={specimen.name} specimen={specimen} onPick={onPick} delay={(i % 4) * 70} />
        ))}
      </div>
    </section>
  );
}

export function How() {
  return (
    <section className="how" id="how">
      <h2 className="how__title rise">How a name grows</h2>
      <div className="how__fields">
      <div className="how__field">
        <div className="card rise" data-ui>
          <span className="card__label">Name</span>
          <span className="card__value">Dana</span>
        </div>
        <p className="how__clause">First it reads the name, ignoring capitals and extra spaces.</p>
      </div>
      <div className="how__field">
        <div className="card rise" data-ui style={{ "--rise-delay": "70ms" } as React.CSSProperties}>
          <span className="card__label">SHA-256 of “dana”</span>
          <span className="card__hash">2c9e0a2585dc7406 589a3724f0027811 506e0f133726303a 15d6779d532a2573</span>
        </div>
        <p className="how__clause">Then it turns those letters into one long number.</p>
      </div>
      <div className="how__field">
        <div className="card rise" data-ui style={{ "--rise-delay": "140ms" } as React.CSSProperties}>
          <span className="card__row"><span>Family</span><span>{DANA.family}</span></span>
          <span className="card__row">
            <span>Colours</span>
            <span className="card__chips">
              {DANA.stops.map((hex) => <i key={hex} style={{ background: hex }} />)}
            </span>
          </span>
        </div>
        <p className="how__clause">That number decides the family, the colours and the petals.</p>
      </div>
      <div className="how__field">
        <div className="card rise" data-ui style={{ "--rise-delay": "210ms" } as React.CSSProperties}>
          <img src={stillOf(DANA)} alt="Dana's dahlia, fully open" loading="lazy" width={800} height={800} />
        </div>
        <p className="how__clause">Then it grows, and nothing was picked by hand.</p>
      </div>
      </div>
    </section>
  );
}

function Garden() {
  return (
    <div className="panel" data-ui>
      <div className="panel__title"><span>My flowers</span><span>3</span></div>
      {[ANNA, BEN, ZARA].map((s, i) => (
        <div className="panel__row" key={s.name} data-picked={i === 0}>
          <img src={stillOf(s)} alt="" loading="lazy" />
          <span>{s.name}<small style={{ textTransform: "capitalize" }}>{s.family}</small></span>
          <small>Saved</small>
        </div>
      ))}
    </div>
  );
}

function Download() {
  return (
    <div className="panel" data-ui>
      <div className="panel__title"><span>Download</span></div>
      <div className="panel__menu">
        <div className="panel__item" data-picked="true"><span>Picture</span><small>PNG</small></div>
        <div className="panel__item"><span>Slowly turning</span><small>GIF</small></div>
      </div>
    </div>
  );
}

function Share() {
  return (
    <div className="panel" data-ui>
      <div className="panel__title"><span>Send to Ben</span></div>
      <div className="panel__preview">
        <img src={stillOf(BEN)} alt="" loading="lazy" />
        <span>Ben's rose<br /><small>Opens on its own page, no sign-in needed.</small></span>
      </div>
      <div className="panel__action">Copy link</div>
    </div>
  );
}

function Mint() {
  return (
    <div className="panel" data-ui>
      <div className="panel__title"><span>Mint as an NFT</span><span>Soon</span></div>
      <p>One flower for each name, held in your own wallet. Not open yet.</p>
      <div className="panel__action" data-off="true">Coming soon</div>
    </div>
  );
}

const PANELS = [
  { title: "Keep a garden", text: "Save the flowers you grow and come back to them from any device.", view: <Garden /> },
  { title: "Send it", text: "Every flower gets its own page to share, and it opens without an account.", view: <Share /> },
  { title: "Download it", text: "Take a picture of it, or a GIF of it slowly turning.", view: <Download /> },
  { title: "Mint it", text: "Owning a flower as an NFT is on its way. It isn't open yet.", view: <Mint /> },
];

export function Keep() {
  const row = useRef<HTMLDivElement>(null);
  const [lit, setLit] = useState(0);

  const centre = (index: number) => {
    const el = row.current;
    const panel = el?.querySelectorAll<HTMLElement>(".keep__panel")[index];
    if (!el || !panel) return;
    el.scrollTo({ left: panel.offsetLeft + panel.offsetWidth / 2 - el.clientWidth / 2, behavior: "smooth" });
  };

  useEffect(() => {
    const el = row.current;
    if (!el) return;
    const onScroll = () => {
      const middle = el.scrollLeft + el.clientWidth / 2;
      const panels = Array.from(el.querySelectorAll<HTMLElement>(".keep__panel"));
      const distances = panels.map((p) => Math.abs(p.offsetLeft + p.offsetWidth / 2 - middle));
      setLit(distances.indexOf(Math.min(...distances)));
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <section className="keep">
      <div className="keep__head">
        <h2 className="rise">Yours to keep.</h2>
        <div>
          <p className="keep__note" aria-live="polite">
            <strong>{PANELS[lit].title}</strong>
            {PANELS[lit].text}
          </p>
          <div className="keep__nav">
            <button type="button" className="pp-button pp-button--light" disabled={lit === 0} onClick={() => centre(lit - 1)}>
              Previous
            </button>
            <button type="button" className="pp-button pp-button--light" disabled={lit === PANELS.length - 1} onClick={() => centre(lit + 1)}>
              Next
            </button>
          </div>
        </div>
      </div>
      <div className="keep__row" ref={row} tabIndex={0} aria-label="What you can do with a flower, scroll sideways">
        {PANELS.map((panel, i) => (
          <div className="keep__panel" key={panel.title} data-lit={i === lit} onClick={() => centre(i)}>
            {panel.view}
          </div>
        ))}
      </div>
    </section>
  );
}

const QUESTIONS = [
  ["Do I need an account?", "Not to grow a flower. You only sign in when you want to keep one in your garden."],
  ["Will my name always grow the same flower?", "Yes. The flower is worked out from the name itself, so it comes out the same for anyone, on any device. Capitals and extra spaces don't change it."],
  ["What can I do with a flower?", "Save it to your garden, download it as a picture or a turning GIF, or send its link to someone."],
  ["Do you keep the names people type?", "Yes. A name is stored with its flower so the flower can have its own page and be shared. Don't type anything you wouldn't want saved."],
  ["Can I mint my flower as an NFT?", "Not yet. Minting works in testing but isn't open on this site. It will be marked here when it is."],
] as const;

export function Questions() {
  return (
    <section className="faq" id="questions">
      <h2 className="faq__heading rise">Questions</h2>
      <div className="faq__list">
        {QUESTIONS.map(([question, answer], i) => (
          <details className="faq__item" key={question} open={i === 0}>
            <summary>
              {question}
              <span className="faq__sign" aria-hidden="true" />
            </summary>
            <p>{answer}</p>
          </details>
        ))}
      </div>
    </section>
  );
}

export function Close({ name }: { name: string }) {
  const navigate = useNavigate();
  const [value, setValue] = useState(name);
  useEffect(() => setValue(name), [name]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    navigate(`/create?name=${encodeURIComponent(value.trim())}&grow=1`);
  };

  return (
    <section className="close">
      <div className="rise">
        <h2>Keep the one you grew.</h2>
        <p>Saving takes an email and a password, or your Google account. Growing never needs either.</p>
      </div>
      <form className="dialog rise" data-ui onSubmit={submit}>
        <h3>Save this flower</h3>
        <label>
          Name
          <input className="studio__input" value={value} maxLength={64} onChange={(e) => setValue(e.target.value)} />
        </label>
        <button className="pp-button" type="submit" disabled={!value.trim()}>
          Open it in the console
        </button>
      </form>
    </section>
  );
}

export function Foot() {
  return (
    <footer className="foot">
      <div className="foot__tile foot__statement">
        <p>A name becomes a flower. Grow one for yourself or for someone you love.</p>
        <small className="foot__small">© 2026 Petal Pixel</small>
      </div>
      <nav className="foot__tile foot__nav" aria-label="Footer">
        <ul className="foot__list">
          <li><a href="#flowers">Flowers</a></li>
          <li><a href="#how">How it works</a></li>
          <li><a href="#questions">Questions</a></li>
          <li><Link to="/console">Console</Link></li>
        </ul>
      </nav>
      <div className="foot__tile foot__maker">
        <p>Made by</p>
        <a href="https://bexultan.dev">Bexultan Karimtayev</a>
      </div>
      <div className="foot__tile foot__mark">Petal Pixel</div>
      <div className="foot__tile foot__open">
        <p>Your garden is waiting.</p>
        <Link className="pp-button" to="/console">Open console</Link>
      </div>
    </footer>
  );
}

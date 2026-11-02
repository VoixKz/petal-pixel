import { lazy, Suspense, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { buildBlossom, speciesFor } from "@/math/blossom/build";
import { identityOf } from "@/math/blossom/identity";
import { SPECIES } from "@/math/blossom/species";
import { FIRST_NAME, FIRST_SEED, hasWebGL, LAMPS, lampOf, stillOf, SPECIMENS, type GrownFlower, type Specimen } from "./specimens";

const KeptFlower = lazy(() => import("./KeptFlower"));
const TYPING_PAUSE_MS = 350;

function Tile({ specimen, onPick, delay }: { specimen: Specimen; onPick: (name: string) => void; delay: number }) {
  return (
    <button
      type="button"
      className="tile rise"
      style={{ "--rise-delay": `${delay}ms` } as React.CSSProperties}
      onClick={() => onPick(specimen.name)}
      aria-label={`Grow ${specimen.name}'s ${specimen.species}`}
    >
      <span className="tile__picture">
        <img src={stillOf(specimen.name, false)} alt="" loading="lazy" width={900} height={900} />
        <img className="tile__night" src={stillOf(specimen.name, true)} alt="" loading="lazy" width={900} height={900} />
      </span>
      <span className="tile__strip">
        <span className="tile__name">{specimen.name}</span>
        <span>{specimen.species}</span>
      </span>
    </button>
  );
}

export function Names({ onPick }: { onPick: (name: string) => void }) {
  const [night, setNight] = useState(false);
  return (
    <section className="names" id="flowers" data-night={night}>
      <div className="names__grid">
        <div className="names__intro rise">
          <h2>Same name, same flower.</h2>
          <div>
            <p>
              These are real flowers from six names. Grow any of them again and you get exactly this flower, on any
              device, for anyone.
            </p>
            <button type="button" className="pp-button pp-button--quiet" onClick={() => setNight(!night)}>
              {night ? "Turn the lights on" : "Turn the lights off"}
            </button>
          </div>
        </div>
        {SPECIMENS.map((specimen, i) => (
          <Tile key={specimen.name} specimen={specimen} onPick={onPick} delay={(i % 4) * 70} />
        ))}
      </div>
    </section>
  );
}

export function How() {
  const dana = useMemo(() => buildBlossom(FIRST_SEED, speciesFor(FIRST_SEED)), []);
  return (
    <section className="how" id="how">
      <h2 className="how__title rise">How a name grows.</h2>
      <div className="how__fields">
        <div className="how__field">
          <p className="how__name rise" data-ui>{FIRST_NAME}</p>
          <p className="how__clause">First it reads the name, ignoring capitals and extra spaces.</p>
        </div>
        <div className="how__field">
          <p className="how__hash rise" data-ui role="img" aria-label={`SHA-256 of dana: ${FIRST_SEED}`}>
            {FIRST_SEED.match(/.{8}/g)?.map((part) => <span key={part}>{part}</span>)}
          </p>
          <p className="how__clause">Then it turns those letters into one long number.</p>
        </div>
        <div className="how__field">
          <dl className="how__facts rise" data-ui>
            <div><dt>Kind</dt><dd>{dana.species.label}</dd></div>
            <div><dt>Opens</dt><dd>{Math.round(dana.fullness * 100)}%</dd></div>
            <div>
              <dt>Colours</dt>
              <dd className="how__chips">{dana.colour.map((hex) => <i key={hex} style={{ background: hex }} />)}</dd>
            </div>
          </dl>
          <p className="how__clause">That number decides the kind of flower, its colour and how far it opens.</p>
        </div>
        <div className="how__field">
          <img className="how__bloom" src={stillOf(FIRST_NAME, true)} alt={`${FIRST_NAME}'s ${dana.species.label.toLowerCase()}, fully open and lit from inside`} loading="lazy" width={900} height={900} />
          <p className="how__clause">Then it grows. The same name always grows the same flower.</p>
        </div>
      </div>
    </section>
  );
}

const KEEPING = [
  { title: "Keep a garden", text: "Save the flowers you grow and come back to them from any device." },
  { title: "Send it", text: "Every flower gets its own page to share, and it opens without an account." },
  { title: "Download it", text: "Take a picture of it, or a GIF of it slowly turning." },
  { title: "Mint it", text: "Owning a flower as an NFT is on its way. It isn't open yet." },
];

export function Keep() {
  return (
    <section className="keep">
      <h2 className="rise">Yours to keep.</h2>
      <div className="keep__shelf" aria-hidden="true">
        {LAMPS.map((name, i) => (
          <figure className="keep__lamp rise" key={name} style={{ "--rise-delay": `${i * 90}ms` } as React.CSSProperties}>
            <img src={lampOf(name)} alt="" loading="lazy" width={720} height={1040} />
            <figcaption>{name}</figcaption>
          </figure>
        ))}
      </div>
      <ul className="keep__list">
        {KEEPING.map((item) => (
          <li key={item.title}>
            <strong>{item.title}</strong>
            {item.text}
          </li>
        ))}
      </ul>
    </section>
  );
}

const QUESTIONS = [
  ["Do I need an account?", "Not to grow a flower. You only sign in when you want to keep one in your garden."],
  ["Will my name always grow the same flower?", "Yes. The flower is worked out from the name itself, so it comes out the same for anyone, on any device. Capitals and extra spaces don't change it."],
  ["Are these real flowers?", "Yes. Each one is a 3D model made from a real flower. Your name picks which flower it is, its colour and how far it opens."],
  ["What can I do with a flower?", "Save it to your garden, download it as a picture or a turning GIF, or send its link to someone."],
  ["Do you keep the names people type?", "Not on this page. A flower here is worked out in your browser and nothing is sent anywhere. A name is stored only when you save it to your garden, so that the flower can have its own page. Don't save anything you wouldn't want kept."],
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

export function Close({ flower }: { flower: GrownFlower }) {
  const navigate = useNavigate();
  const [webgl] = useState(hasWebGL);
  const section = useRef<HTMLElement>(null);
  const [value, setValue] = useState(flower.name);
  const [shown, setShown] = useState(flower);
  const [near, setNear] = useState(false);
  const [visible, setVisible] = useState(false);
  const [drawn, setDrawn] = useState(false);
  useEffect(() => setValue(flower.name), [flower.name]);

  // The flower beside the field is the one the field names, once the typing stops.
  useEffect(() => {
    const wanted = value.trim();
    if (!wanted) return;
    const wait = setTimeout(() => {
      const { seed, kind } = identityOf(wanted);
      setShown({ name: wanted, seed, species: kind });
    }, TYPING_PAUSE_MS);
    return () => clearTimeout(wait);
  }, [value]);

  useEffect(() => {
    const el = section.current;
    if (!el || !("IntersectionObserver" in window)) return;
    const nearby = new IntersectionObserver(([entry]) => entry.isIntersecting && setNear(true), { rootMargin: "60% 0px" });
    const inView = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting));
    nearby.observe(el);
    inView.observe(el);
    return () => {
      nearby.disconnect();
      inView.disconnect();
    };
  }, []);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    navigate(`/create?name=${encodeURIComponent(value.trim())}&grow=1`);
  };

  const name = value.trim();

  return (
    <section ref={section} className="close" id="save">
      <div className="close__words rise">
        <h2>Keep the one you grew.</h2>
        <p>Saving takes an email and a password, or your Google account. Growing never needs either.</p>
        <form className="close__form" onSubmit={submit}>
          <input className="field" aria-label="The name to keep" value={value} maxLength={64} onChange={(e) => setValue(e.target.value)} />
          <button className="pp-button" type="submit" disabled={!name}>
            {name && name.length <= 18 ? `Keep ${name}'s flower` : "Keep this flower"}
          </button>
        </form>
      </div>
      <div className="close__flower" role="img" aria-label={`${shown.name}'s ${shown.species}, fully open`}>
        <img data-gone={drawn} src={stillOf(FIRST_NAME, false)} alt="" loading="lazy" width={900} height={900} />
        {near && webgl && (
          <Suspense fallback={null}>
            <KeptFlower seed={shown.seed} active={visible} onReady={() => setDrawn(true)} />
          </Suspense>
        )}
      </div>
    </section>
  );
}

export function Foot() {
  return (
    <footer className="foot">
      <div className="foot__top">
        <p className="foot__statement">A name becomes a flower. Grow one for yourself or for someone you love.</p>
        <nav aria-label="Footer">
          <ul className="foot__list">
            <li><a href="#grow">Grow</a></li>
            <li><a href="#flowers">Flowers</a></li>
            <li><a href="#how">How it works</a></li>
            <li><a href="#questions">Questions</a></li>
          </ul>
        </nav>
        <div className="foot__open">
          <Link className="pp-button pp-button--light" to="/console">Your garden</Link>
        </div>
      </div>
      <p className="foot__mark" aria-hidden="true">Petal Pixel</p>
      <div className="foot__base">
        <small>© 2026 Petal Pixel</small>
        <small>Made by <a href="https://bexultan.dev">Bexultan Karimtayev</a></small>
      </div>
      <p className="foot__credits">
        Real flowers, changed for this site:{" "}
        {SPECIES.map(({ label, head: { credit } }, i) => (
          <span key={label}>
            {i > 0 && ", "}
            <a href={credit.url}>{label}</a> by {credit.by} ({credit.licence})
          </span>
        ))}
        .
      </p>
    </footer>
  );
}

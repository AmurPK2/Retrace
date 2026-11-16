import { ToolIcon } from "./ToolIcon";
const tools = [
  [
    "select",
    "Velg og flytt",
    "Klikk inni en tegning for å velge. Dra kroppen for å flytte, eller et håndtak for å endre formen. Klikk tom plass eller trykk Esc for å fjerne valget.",
  ],
  [
    "horizontal",
    "Vannrett nivå",
    "Klikk én gang på ønsket pris. Dra linjen for å flytte nivået.",
  ],
  [
    "ray",
    "Stråle",
    "Velg to punkter. Linjen fortsetter forbi det andre punktet. Shift låser vannrett eller loddrett.",
  ],
  [
    "trend",
    "Trendlinje",
    "Velg to endepunkter, eller hold og dra. Endre endepunktene med håndtakene. Shift låser retningen.",
  ],
  [
    "zone",
    "Rektangel",
    "Hold og dra over et prisområde. Dra en kant eller et hjørne for å endre størrelsen.",
  ],
  [
    "fib",
    "Fibonacci",
    "Dra mellom to ankerpunkter. Velg tegningen for å endre nivåer, etiketter og farger. Lagre oppsettet som din standard.",
  ],
  [
    "long",
    "Kjøpsplan",
    "Tegn en plan med inngang, stop loss og mål. Dra nivåene hver for seg. Tegningen sender ingen ordre.",
  ],
  [
    "short",
    "Salgsplan",
    "Samme planverktøy for salg. Endre mål direkte eller gjennom R:R. Kontroller nivåene før du oppretter en separat ordre.",
  ],
  [
    "magnet",
    "Magnet",
    "Veksler mellom av, svak og sterk låsing til candle-priser. Ctrl bytter midlertidig mens du tegner. Ordrenivåer kan fortsatt dras fritt.",
  ],
] as const;
export function WorkspaceHelp() {
  return (
    <div className="workspace-help">
      <section>
        <h3>Knappene over charten</h3>
        <dl className="shortcut-guide">
          <dt>Ny ordre</dt>
          <dd>
            Vis et ordreutkast på charten. Høyreklikk ved en pris for å starte
            der.
          </dd>
          <dt>4H-candle</dt>
          <dd>
            Vis eller skjul én stor pågående candle. Den deler prisskala med
            charten. Klikk overskriften på indikatoren for bredde, farger og
            tidsramme.
          </dd>
          <dt>Lær og øv</dt>
          <dd>
            Én læringssti med ti trinn, seks videoguider og bevarte forsøk. Lås
            svaret før avsløring. Fakta og begrunnelse vurderes hver for seg.
          </dd>
          <dt>Tegninger</dt>
          <dd>
            Finn, velg, skjul eller lås objektene du har tegnet. De bevares når
            du bytter tidsramme.
          </dd>
          <dt>Mer</dt>
          <dd>
            Ekstra verktøy med forklaring: C1/C2, indikatorer, to charts,
            chart-tilpasning, leksjoner og ordredetaljer.
          </dd>
        </dl>
      </section>
      <section>
        <h3>Lag og juster en ordre</h3>
        <p>
          Høyreklikk ved ønsket pris og velg en ordre. Dra inngang, SL og TP
          hver for seg. Størrelsen i lots står rett ved inngangsnivået.
          Kontroller kontant risiko og trykk <b>Legg inn ordre</b> for å legge
          ordren inn i replayen.
        </p>
        <p>
          En ventende ordre kan få ny størrelse før den fylles. En fylt posisjon
          beholder den faktiske størrelsen. Rødt markerer stop loss, grønt
          markerer take profit, og inngangen merkes med kjøp eller salg.
        </p>
      </section>
      <section>
        <h3>La coachen vurdere oppsettet</h3>
        <p>
          Åpne Coach og trykk <b>Vurder oppsettet</b>. Coachen leser synlige
          candles, tegninger, ordre og lagrede regler ved replay-tiden. Du kan
          også stille et vanlig spørsmål. Skjermbilde brukes som støtte, mens
          beregnede priser og risiko kommer fra appens data.
        </p>
      </section>
      <section>
        <h3>Tegneverktøyene på venstre side</h3>
        <p>
          Hold pekeren over et ikon for navnet. Når du velger et verktøy, får du
          en kort bruksforklaring over charten.
        </p>
        <div className="tool-guide">
          {tools.map(([kind, title, text]) => (
            <div className="tool-guide-row" key={kind}>
              <ToolIcon kind={kind} />
              <div>
                <b>{title}</b>
                <p>{text}</p>
              </div>
            </div>
          ))}
        </div>
      </section>
      <section>
        <h3>Snarveier</h3>
        <dl className="shortcut-guide">
          <dt>Space / →</dt>
          <dd>Gå én candle frem. Å holde tasten inne gjentar ikke steget.</dd>
          <dt>P</dt>
          <dd>Spill av eller pause replay.</dd>
          <dt>Esc</dt>
          <dd>Lukk dialogen, menyen eller valget.</dd>
          <dt>Ctrl Z / Ctrl Y</dt>
          <dd>Angre eller gjenta en tegningsendring.</dd>
          <dt>Delete</dt>
          <dd>Slett den valgte tegningen.</dd>
          <dt>?</dt>
          <dd>Åpne denne hjelpen og pause replay.</dd>
        </dl>
        <p>
          Snarveier for replay er inaktive mens du skriver eller har en dialog
          åpen.
        </p>
      </section>
    </div>
  );
}

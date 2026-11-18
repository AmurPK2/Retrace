import { z } from "zod";

export const RR_SOURCE_VERSION = "rr-sources-20261118-v1";
export const RR_RECORDINGS = [
  [1, "RJvRZKV5GYk", "Introduksjon, NOW, limits og risiko"],
  [2, "fTmCa0tC1h4", "CRT, soner og inngangsvarianter"],
  [3, "Y0uVwWYaRQ0", "Tap, tankesett og TP1-alternativet"],
  [4, "XQVKx5Xz8Z8", "Faser, supply og SMT"],
  [5, "TUSHqSZycrM", "Kontantrisiko og R"],
  [6, "BFXFE9KFDfI", "Candleforløp og tidsjustering"],
  [7, "31s-MBT6LUM", "Kvartaler, totrinns SMT og C3"],
  [8, "7ZA_PDnyPGs", "CISD, MSS, BOS og venting"],
  [9, "EP3c2zkPgGI", "IPDA og kontekstavhengige modeller"],
  [10, "8-iZA5x-Vmg", "C1–C2–C3: brudd eller manipulasjon"],
  [11, "I79TFdSMu5Q", "IRL til ERL, innganger og exits"],
  [14, "RbKiLdUk0dw", "Protected swings, lotstørrelse og fire delmål"],
] as const;
export type RRRef = { video: number; at: number; end: number };
export function rrSourceUrl(ref: RRRef) {
  const recording = RR_RECORDINGS.find((v) => v[0] === ref.video);
  if (!recording) throw Error("Ukjent RR-opptak.");
  return `https://www.youtube.com/watch?v=${recording[1]}&t=${ref.at}s`;
}
export const RR_MODULES = [
  "Kart og narrativ",
  "C1, C2 og C3",
  "Tid og candleforløp",
  "Inngangssoner",
  "CISD og struktur",
  "SMT og beskyttelse",
  "Inngang og risiko",
  "Exits og kritisk gjennomgang",
];
export type SceneId =
  | "range"
  | "sweep"
  | "break"
  | "inside"
  | "quarters"
  | "fvg"
  | "inverse"
  | "structure"
  | "smt"
  | "protected"
  | "risk"
  | "targets"
  | "loss";
export type SourceTask = {
  id: string;
  module: number;
  title: string;
  question: string;
  scene: SceneId;
  context: string;
  options: { id: string; label: string }[];
  correct: string;
  targets?: { id: string; value: number; label: string }[];
  numeric?: {
    id: string;
    label: string;
    correct: number;
    unit: string;
    tolerance: number;
  }[];
  explanation: string;
  limit: string;
  refs: RRRef[];
};
const ref = (video: number, at: number, end: number): RRRef => ({
  video,
  at,
  end,
});
const options = (...pairs: string[]) =>
  pairs.map((s) => {
    const [id, label] = s.split("|");
    return { id, label };
  });
export const RR_SOURCE_TASKS: SourceTask[] = [
  {
    id: "external",
    module: 0,
    title: "Finn den eksterne likviditeten",
    scene: "range",
    question:
      "Trykk på det øvre ytre swingpunktet utenfor det markerte interne området.",
    context:
      "Før inngang: skill et ytre swingpunkt fra et område inne i rangen.",
    options: options(
      "A|A · øvre swingpunkt",
      "B|B · indre sone",
      "C|C · lokal candle",
    ),
    correct: "A",
    explanation:
      "A er den ytre toppen i dette avgrensede diagrammet. B er et internt område. Jake bruker rammens ytterpunkter og interne soner til å beskrive hvor han vil at prisen skal bevege seg.",
    limit:
      "Hvilket større swingpunkt som er relevant, må begrunnes i kontekst. Appen velger ikke automatisk den sterkeste rangen.",
    refs: [ref(7, 322, 485), ref(11, 124, 345)],
  },
  {
    id: "erl-irl",
    module: 0,
    title: "ERL → IRL",
    scene: "range",
    question:
      "Det ytre lave punktet er tatt. Ideen er nå en bevegelse inn i rangen. Trykk på målet for akkurat denne ideen.",
    context:
      "Variant: ekstern til intern likviditet. Dette kan være en motbevegelse inne i en større trend.",
    options: options(
      "A|A · motsatt ytre topp",
      "B|B · indre sone",
      "C|C · samme lokale candle",
    ),
    correct: "B",
    explanation:
      "Målet i ERL→IRL-ideen er det interne området B. I time 14 skiller Jake denne oppgangen fra en eventuell senere salgside tilbake mot ytre likviditet.",
    limit:
      "Et tatt ytterpunkt gjør ikke et kjøp automatisk gyldig. Retning og lokal inngang trenger fortsatt støtte.",
    refs: [ref(7, 322, 485), ref(14, 3096, 3185)],
  },
  {
    id: "irl-erl",
    module: 0,
    title: "IRL → ERL",
    scene: "range",
    question:
      "Prisen har reagert i det interne området B. I en bullish IRL→ERL-idé: trykk på det planlagte eksterne målet.",
    context:
      "Variant: intern til ekstern likviditet. Avgjør målet før du velger inngang.",
    options: options(
      "A|A · ytre topp",
      "B|B · samme indre sone",
      "C|C · inngangscandlen",
    ),
    correct: "A",
    explanation:
      "A er det ytre målet i den oppgitte bullish-ideen. Jake viser også bearish speilbilder. En FVG inne i rangen er et mulig område for reaksjon, ikke i seg selv hele narrativet.",
    limit:
      "Ytre målnivå er en hypotese. Det er ingen lovnad om at prisen når det.",
    refs: [ref(11, 124, 345), ref(9, 324, 380)],
  },
  {
    id: "phase",
    module: 0,
    title: "Retracement eller reversering?",
    scene: "quarters",
    question:
      "Diagrammet viser konsolidering → ekspansjon → retracement. Hvilken fase er neste i modellen han beskriver? Velg feltet til høyre.",
    context: "IPDA er hans beskrivende modell av prisfaser.",
    options: options(
      "expand|Ny ekspansjon",
      "guarantee|Garantert reversering",
      "random|Alltid konsolidering",
    ),
    correct: "expand",
    explanation:
      "I denne modellen følger ny ekspansjon etter retracement. Han beskriver også en annen modell med reversering. Likviditetskontekst er nødvendig for å skille ideene; diagrammet beviser ingen skjult markedsalgoritme.",
    limit: "En modell er ikke bevis for hva neste candle vil gjøre.",
    refs: [ref(9, 915, 1160), ref(4, 1424, 1545)],
  },
  {
    id: "c1-range",
    module: 1,
    title: "Marker hele C1-rangen",
    scene: "sweep",
    question:
      "Dra de to markørene til C1-high og C1-low. Bruk wick-spissene, ikke kroppens kanter.",
    context:
      "C1 er allerede valgt som referanse i dette undervisningsdiagrammet.",
    options: [],
    correct: "levels",
    targets: [
      { id: "high", value: 70, label: "C1-high" },
      { id: "low", value: 35, label: "C1-low" },
    ],
    explanation:
      "Referanserangen omfatter hele C1: high 70 og low 35 på diagrammets indeks. I neste oppgave sammenlignes C2s wick og sluttpris med disse grensene.",
    limit:
      "Valget av relevant C1 i et ekte chart er en egen kontekstoppgave. Den siste candlen er ikke alltid det eneste mulige ankeret.",
    refs: [ref(2, 428, 705), ref(10, 214, 454)],
  },
  {
    id: "body-break",
    module: 1,
    title: "C2 stenger utenfor",
    scene: "break",
    question:
      "C2 stenger over C1-high. Hvilken grunnidé for C3 beskriver Jake for dette kroppbruddet?",
    context: "Bare ferdige C1 og C2 er kjent. C3 er skjult.",
    options: options(
      "up|Betinget fortsettelse opp",
      "down|Automatisk sell",
      "certain|Sikkert kjøpssignal",
    ),
    correct: "up",
    explanation:
      "Hans grunnidé etter et body break over C1-high er videre ekspansjon opp i C3. Det er en betinget forventning som må passe større kontekst; det er ikke en komplett buy-regel.",
    limit: "Ingen C3 eller gevinst vises som fasit på at handelen var gyldig.",
    refs: [ref(10, 214, 332)],
  },
  {
    id: "wick-sweep",
    module: 1,
    title: "Wick under, close tilbake",
    scene: "sweep",
    question:
      "C2 har wick under C1-low, men stenger inne i rangen. Hva beskriver dette?",
    context: "Den bullish speilvarianten av wick-manipulasjonen i timen.",
    options: options(
      "sweep|Sweep av low med retur innenfor",
      "break|Body break under C1-low",
      "entry|En ferdig inngang uten mer kontekst",
    ),
    correct: "sweep",
    explanation:
      "Det er en sweep av bunnen med close tilbake inne. Det gir en mulig idé mot motsatt side. Candlebeskrivelsen alene bekrefter verken lokal inngang eller at hele bevegelsen blir en reversering.",
    limit:
      "Begge sider tatt, close på grensen og inside candles må ikke tvinges inn i denne entydige varianten.",
    refs: [ref(10, 332, 454), ref(2, 428, 705)],
  },
  {
    id: "failed-manipulation",
    module: 1,
    title: "Hvorfor en sweep kan mislykkes",
    scene: "inside",
    question:
      "En lokal sweep peker ned, men det større øvre likviditetsmålet er ikke tatt. Kan sweepen alene godkjenne en sell?",
    context:
      "Samme lokale geometri kan bli retracement i stedet for full reversering.",
    options: options(
      "no|Nei · sjekk det større målet og narrativet",
      "yes|Ja · hver sweep skal snu markedet",
      "rotate|Ja · bytt bare automatisk C1",
    ),
    correct: "no",
    explanation:
      "Jake viser mislykket manipulasjon når det større likviditetsarbeidet ikke er ferdig. Derfor starter du med rammen og målet, og vurderer lokal bekreftelse etterpå.",
    limit:
      "En inside candle betyr heller ikke i seg selv at den gamle ideen er ugyldig eller at C2 må bli ny C1.",
    refs: [ref(11, 345, 600), ref(10, 454, 835)],
  },
  {
    id: "ohlc-path",
    module: 2,
    title: "Candlefarge viser ikke hele reisen",
    scene: "sweep",
    question:
      "En ferdig bullish candle har open, low, high og close. Kan du ut fra denne candlen alene vite at low kom før high?",
    context:
      "Jake bruker open→low→high→close som forventet bullish ekspansjonsforløp.",
    options: options(
      "unknown|Nei · intrabar-rekkefølgen må undersøkes lavere",
      "yes|Ja · alle grønne candles tar low først",
      "ema|Bare hvis EMA peker opp",
    ),
    correct: "unknown",
    explanation:
      "Han beskriver et forventet forløp å se etter. Selve OHLC-oppsummeringen forteller ikke når high og low kom. Lavere tidsramme eller ticks må vise den faktiske rekkefølgen.",
    limit:
      "En forventet candlebane er ikke en observerbar fasit før den har skjedd.",
    refs: [ref(6, 25, 302)],
  },
  {
    id: "quarters",
    module: 2,
    title: "Fire deler inne i en større periode",
    scene: "quarters",
    question:
      "Trykk på begge kvartalene han særlig undersøker for manipulasjon i dette eksemplet.",
    context:
      "Oppgaven spør etter hans nevnte Q2/Q3-fokus, ikke et universelt klokkeslett.",
    options: options("q23|Q2 og Q3", "q1|Bare Q1", "q4|Bare Q4"),
    correct: "q23",
    explanation:
      "Han fokuserer på Q2 og Q3 i eksemplet. En større tidsperiode deles i fire, og faser kan sammenlignes på tvers av nivåer. Manipulasjon er ikke låst til bare Q2.",
    limit:
      "Arkivet fastsetter ikke ett komplett anker for klokke, tidssone og DST. Appen finner ikke på et slikt anker.",
    refs: [ref(7, 153, 322), ref(7, 1071, 1206)],
  },
  {
    id: "alignment",
    module: 2,
    title: "Sjekk perioden på lavere tidsramme",
    scene: "quarters",
    question:
      "En 4H-periode er valgt. Hvor mange hele 1H-perioder tilsvarer samme fire timer, uten datagap?",
    context:
      "Hans eksempel deler X i fire; andre overordnede tidsvinduer gir andre underinndelinger.",
    options: options(
      "four|4 · samme start og slutt",
      "sixteen|16 timer",
      "mandatory|Bare 4H→1H→15m kan brukes",
    ),
    correct: "four",
    explanation:
      "Fire 1H-perioder dekker samme fire timer. Poenget er å undersøke fasene inne i den større perioden. Han nevner også H6/H8; det er ikke én obligatorisk tidsrammestige.",
    limit:
      "Kalender og feed må passe før ekte candles kan sammenlignes. Manglende perioder er ikke fyllstoff.",
    refs: [ref(6, 544, 1010)],
  },
  {
    id: "fvg-location",
    module: 3,
    title: "FVG er et område, ikke hele oppsettet",
    scene: "fvg",
    question:
      "Finn FVG-området mellom første og tredje candle. Trykk på området på chartet.",
    context:
      "Numrene viser de tre ferdige candlene i denne forenklede illustrasjonen.",
    options: options(
      "A|A · kropp på candle 2",
      "B|B · gap mellom wick 1 og wick 3",
      "C|C · siste close",
    ),
    correct: "B",
    explanation:
      "B er FVG-området her. Jake bruker FVG som intern sone og som støtte for et større narrativ. Et gap alene er ikke hans komplette konfluens eller en automatisk ordre.",
    limit:
      "Diagrammets tre-candle-geometri er en forklaring av området han viser, ikke en ny RR-inngangsregel.",
    refs: [ref(2, 1125, 1250), ref(11, 1010, 1170), ref(14, 1803, 1858)],
  },
  {
    id: "inversion",
    module: 3,
    title: "Når en FVG får motsatt rolle",
    scene: "inverse",
    question:
      "Det bullish gapet B er brutt nedover, og prisen tester området nedenfra. Hvilken variant viser Jake med dette?",
    context:
      "Et opprinnelig område kan feile og brukes med motsatt rolle, sammen med øvrig kontekst.",
    options: options(
      "ifvg|Mulig bearish IFVG / inversion",
      "always|Gapet må fortsatt være bullish",
      "auto|Sikker sell bare fordi området er berørt",
    ),
    correct: "ifvg",
    explanation:
      "Han viser inversion når tidligere kjøpsområde blir overvunnet og får motsatt rolle. I timen ses også akkumulering, manipulasjon og en høyere ramme. De delene må ikke erstattes av bare et gap-touch.",
    limit:
      "Én universell close-buffer eller minste gapstørrelse er ikke etablert i disse forklaringene.",
    refs: [ref(2, 1080, 1255), ref(9, 447, 565)],
  },
  {
    id: "zone-ranking",
    module: 3,
    title: "Velg ikke automatisk «sterkeste sone»",
    scene: "structure",
    question:
      "To ulike supply-områder er synlige. Har videoene gitt én fullstendig mekanisk regel som alltid velger riktig område?",
    context:
      "Jake bruker candleorigin, rejection og flere tidsrammer i ulike eksempler.",
    options: options(
      "not-defined|Nei · valg og ugyldiggjøring må begrunnes",
      "nearest|Ja · alltid nærmeste åtte candles",
      "largest|Ja · alltid største rektangel",
    ),
    correct: "not-defined",
    explanation:
      "Han demonstrerer hvordan han vurderer soner, men gir ikke en uttømmende rangering for alle konflikter. Oppgaven godkjenner derfor ikke et automatisk sonevalg som «Jakes regel».",
    limit:
      "Dette er en uttrykkelig kunnskapsgrense. Ingen oppdiktet fasit erstatter den.",
    refs: [ref(2, 1844, 2134), ref(14, 1803, 1858)],
  },
  {
    id: "cisd",
    module: 4,
    title: "CISD i hans forklaring",
    scene: "structure",
    question:
      "Trykk på supply-nivået som beskriver lokal CISD i den bullish illustrasjonen.",
    context:
      "A er et større strukturelt swing. B er den nærmere lokale supplyen.",
    options: options(
      "A|A · større motstående struktur",
      "B|B · nærmeste relevante supply",
      "C|C · tilfeldig tidligere close",
    ),
    correct: "B",
    explanation:
      "Jake skiller CISD fra et større strukturbrudd: CISD overvinner den nærmeste relevante supply/demand og endrer lokal levering. Det er ikke automatisk det samme som å bryte det store swingpunktet A.",
    limit:
      "Ingen universell åtte-candle-regel, fast buffer eller identisk close-trigger er gitt for alle hans innganger.",
    refs: [ref(8, 1206, 1360), ref(8, 1477, 1575), ref(6, 985, 1020)],
  },
  {
    id: "mss",
    module: 4,
    title: "CISD er ikke hele strukturskiftet",
    scene: "structure",
    question:
      "Trykk på nivået som må overvinnes for det større strukturskiftet i denne illustrasjonen.",
    context: "Den større strukturen og den lokale supplyen er tegnet separat.",
    options: options(
      "A|A · større swing / MSS-nivå",
      "B|B · lokal supply / CISD-nivå",
      "C|C · en vilkårlig close",
    ),
    correct: "A",
    explanation:
      "Han beskriver MSS som at den meningsfulle motstående strukturen overvinnes. Det ligger lenger unna enn CISD i tegningen. Et lokalt signal er derfor ikke bevis på at hele den høyere trenden har snudd.",
    limit:
      "Svingutvalget er oppgitt i illustrasjonen. Appen hevder ikke å ha løst hans skjønnsmessige swingvalg på alle chart.",
    refs: [ref(8, 1307, 1360), ref(8, 1477, 1575)],
  },
  {
    id: "bos",
    module: 4,
    title: "BOS følger eksisterende trend",
    scene: "structure",
    question:
      "Et bullish forløp bryter en ny topp i samme retning. Hvilket begrep skiller han dette fra CISD med?",
    context: "Begreper som ligner, må ikke bli ett obligatorisk inngangskrav.",
    options: options(
      "bos|BOS · fortsettelse i eksisterende trend",
      "all|CISD, MSS og BOS betyr alltid det samme",
      "mandatory|BOS kreves før hver eneste RR-entry",
    ),
    correct: "bos",
    explanation:
      "Han bruker BOS om videreføring av trenden. CISD er lokal endring i levering, mens MSS gjelder større motstående struktur. Inngangsmodellene hans krever ikke alle det samme store BOS før entry.",
    limit:
      "Bruk hans ord i deres opprinnelige modellkontekst; ikke bland inn en annen lærers CISD-definisjon som hans fasit.",
    refs: [ref(8, 1477, 1575), ref(2, 2134, 2240)],
  },
  {
    id: "smt",
    module: 5,
    title: "SMT trenger en sammenligning",
    scene: "smt",
    question:
      "Gold tar en ny topp. Silver tar ikke sin tilsvarende topp i samme viste intervall. Hva er observasjonen?",
    context:
      "To synkroniserte, illustrerte markeder. Ingen ekte silver-priser er lastet inn.",
    options: options(
      "divergence|Relativ ikke-bekreftelse mellom markedene",
      "double|Bare en dobbelttopp på gold alene",
      "certain|Sikkert vendepunkt og garantert sell",
    ),
    correct: "divergence",
    explanation:
      "SMT er relativ ikke-bekreftelse. I time 8 nevner han silver som sammenligning til gold. Det er ikke nok å se to topper på ett instrument, og SMT kan også feiltolkes når narrativet er galt.",
    limit:
      "Denne illustrasjonen verifiserer ikke SMT på din faktiske økt. Det krever passende sammenligningsdata fra samme tidspunkt.",
    refs: [ref(8, 301, 408), ref(4, 2482, 2620), ref(6, 1132, 1175)],
  },
  {
    id: "two-stage",
    module: 5,
    title: "To trinn er ikke en egen automatisk fasit",
    scene: "smt",
    question:
      "Han viser større SMT og en senere lokal bekreftelse. Kan appen tilskrive ham én bestemt obligatorisk sammenligningspair og terskel for alle varianter?",
    context:
      "Skill forklarte eksempler fra manglende fullstendige definisjoner.",
    options: options(
      "no|Nei · marker hva kilden faktisk viser og hva som mangler",
      "yes|Ja · bruk samme par og terskel overalt",
      "single|Ja · ett gold-chart er alltid nok",
    ),
    correct: "no",
    explanation:
      "Time 7 viser først en større ikke-bekreftelse og så et lokalt trinn med CISD. Den gir ikke en uttømmende regel for sammenligningssymbol, synkronisering og terskler i enhver variant.",
    limit:
      "Totrinns SMT og flere avanserte begreper kan studeres som kildeeksempler, men kan ikke ærlig få en universell automatisk inngangsfasit her.",
    refs: [ref(7, 873, 1023), ref(10, 835, 1080), ref(14, 1803, 1858)],
  },
  {
    id: "entry-modes",
    module: 6,
    title: "NOW, limit eller justert open?",
    scene: "protected",
    question:
      "I den senere NOW-varianten overvåker han sonen. Hva venter han på før han kaller inngangen?",
    context:
      "Dette spør om NOW-forklaringen i time 11, ikke alle innganger i hele arkivet.",
    options: options(
      "cisd|Lokal CISD som støtter narrativet",
      "touch|Bare at prisen berører hvilken som helst sone",
      "eight|Alltid et brudd på nøyaktig åtte tidligere candles",
    ),
    correct: "cisd",
    explanation:
      "I denne forklaringen venter han på CISD i stedet for å legge en blind limit. Time 2 viser likevel en fremoversatt sell limit, og time 6 viser en justert open-variant. Disse må læres som ulike modeller.",
    limit:
      "Et CISD kan feile. Denne beskrivelsen er ikke et krav om at alle tidligere limits var ugyldige.",
    refs: [ref(11, 2418, 2500), ref(2, 2134, 2240), ref(6, 1305, 1408)],
  },
  {
    id: "c2-stop",
    module: 6,
    title: "C3-varianten med SL utenfor C2",
    scene: "sweep",
    question:
      "Vi bruker akkurat C3-eksemplet fra time 11 med stop utenfor C2s sweep-wick. Dra SL til under C2-low (20).",
    context:
      "Variantbundet stopøvelse: bullish speiling av hans viste C2-beskyttelse.",
    options: [],
    correct: "levels",
    targets: [{ id: "sl", value: 18, label: "SL utenfor C2" }],
    explanation:
      "I denne varianten er C2s ytterpunkt det som beskyttes. En stop på C1-low 35 ville ligge inne i sweepen. Vi bruker ikke det ytterste av både C1 og C2 som universell stopregel.",
    limit:
      "18 er en lesbar illustrasjonsverdi under low 20, ikke hans generelle buffer. Andre viste modeller bruker andre ugyldiggjøringer.",
    refs: [ref(11, 1087, 1195)],
  },
  {
    id: "protected-stop",
    module: 6,
    title: "Protected swing bestemmer stoppideen",
    scene: "protected",
    question:
      "I denne bearish fortsettelsesideen er swing A oppgitt som beskyttet. Hvilken påstand passer begrunnelsen i time 14?",
    context:
      "Høyere strukturell kontekst, intern sone og lokal beskyttelse skal passe samme idé.",
    options: options(
      "A|A · tesen er feil hvis det beskyttede swinget brytes",
      "C|C · velg alltid nærmeste candle for høyest mulig R",
      "none|Ingen SL fordi han følger med",
    ),
    correct: "A",
    explanation:
      "Han forklarer at det beskyttede swinget ikke skal tas dersom fortsettelsesideen holder. Stop må knyttes til den ugyldiggjøringen; høy R alene er ikke grunn til å gjøre den mindre.",
    limit:
      "Hvilket swing som er beskyttet krever støtte, blant annet hans kontekst og relative bekreftelser. Navnet «protected» garanterer ingenting.",
    refs: [ref(14, 827, 890), ref(8, 909, 944)],
  },
  {
    id: "stop-variants",
    module: 6,
    title: "Hvorfor ikke samme SL i alle modeller?",
    scene: "protected",
    question:
      "Time 9 viser stop ved halve en bestemt candle, time 11 utenfor C2 og time 14 ved beskyttet swing. Hva skal du gjøre med forskjellen?",
    context:
      "Regler for ulike eksempler må ikke settes sammen til en oppdiktet universell regel.",
    options: options(
      "variant|Velg og navngi modellen · begrunn dens ugyldiggjøring",
      "half|Bruk alltid 50 % av enhver 4H-candle",
      "full|Krev alltid ytterste wick på både C1 og C2",
    ),
    correct: "variant",
    explanation:
      "Halv-candle-stoppet i time 9 er kontekstavhengig: han forventet ingen dypere retur. Det gir ikke en generell 50 %-regel for alle candles eller en generell tillatelse til å stramme enhver stop.",
    limit:
      "Når referansen for «50 %» ikke er entydig i kilden, får den ikke en automatisk prisfasit i appen.",
    refs: [ref(9, 565, 595), ref(11, 1087, 1195), ref(14, 827, 890)],
  },
  {
    id: "cash-risk",
    module: 6,
    title: "Lik kontantrisiko med ulik SL",
    scene: "risk",
    question:
      "Illustrert risiko er 100. Tap per 1 lot ved de to stoppene er 400 og 200. Fyll inn lotstørrelsen i hvert felt.",
    context:
      "Regnestykket forklarer prinsippet i sizing-tavlen. Enhetene er uttrykkelig tap per lot, ikke antatte gold-pips.",
    options: [],
    correct: "numeric",
    numeric: [
      {
        id: "wide",
        label: "Bred SL · 400 per lot",
        correct: 0.25,
        unit: "lot",
        tolerance: 0.0001,
      },
      {
        id: "tight",
        label: "Smal SL · 200 per lot",
        correct: 0.5,
        unit: "lot",
        tolerance: 0.0001,
      },
    ],
    explanation:
      "100/400 = 0,25 lot; 100/200 = 0,50 lot. Beløpet ved ugyldiggjøring bestemmer størrelsen. Flere innganger deler en samlet risiko; samme lot på ulik stopavstand gir ulik kontant risiko.",
    limit:
      "Dette er tavlens aritmetikk før kostnader. Ekte sizing krever instrumentets faktiske kontrakt, lotsteg og kostnader. Eksempelbeløpet er ingen risikoanbefaling.",
    refs: [ref(5, 2178, 2320), ref(14, 1485, 1680)],
  },
  {
    id: "four-tp",
    module: 7,
    title: "Fire delmål i time 14",
    scene: "targets",
    question:
      "Sett andelen av den opprinnelige posisjonen ved hvert av de fire delmålene slik han anbefaler i denne timen.",
    context:
      "Navngitt variant: fire like deler. Prosentene gjelder opprinnelig størrelse.",
    options: [],
    correct: "numeric",
    numeric: [1, 2, 3, 4].map((i) => ({
      id: "tp" + i,
      label: "TP" + i,
      correct: 25,
      unit: "%",
      tolerance: 0.01,
    })),
    explanation:
      "Han anbefaler 25 % ved hvert av fire delmål. Deretter omtaler han BE etter første mål. Andre timer viser TP1-only og andre delinger; dette er én dokumentert variant, ikke en uforanderlig fordeling.",
    limit:
      "Fire like deler kan være umulig med et lite faktisk lotantall. Ingen automatisk avrunding opp eller ekstra risiko legges til.",
    refs: [ref(14, 1680, 1800), ref(11, 1271, 1420), ref(3, 2230, 2300)],
  },
  {
    id: "weighted-r",
    module: 7,
    title: "Hva tjente hele den opprinnelige posisjonen?",
    scene: "targets",
    question:
      "I regneeksemplet tas fire 25 %-deler ved 2R, 3R, 4R og 5R. Skriv total R for opprinnelig risiko.",
    context:
      "R-nivåene er et tydelig merket regneeksempel, ikke påståtte mål fra et virkelig signal.",
    options: [],
    correct: "numeric",
    numeric: [
      {
        id: "r",
        label: "Total realisert R før kostnader",
        correct: 3.5,
        unit: "R",
        tolerance: 0.01,
      },
    ],
    explanation:
      "0,25×2 + 0,25×3 + 0,25×4 + 0,25×5 = 3,5R. Siste mål på 5R betyr ikke at hele opprinnelige posisjonen tjente 5R. Det er normal R-aritmetikk anvendt på hans fire-delers variant.",
    limit:
      "Dette er en aritmetisk følge av den viste fordelingen, ikke en direkte sitert målrekke eller dokumentert avkastning fra Jake.",
    refs: [ref(14, 1680, 1800), ref(5, 1071, 1260)],
  },
  {
    id: "be-versions",
    module: 7,
    title: "BE: skill anbefaling fra personlig praksis",
    scene: "targets",
    question:
      "Time 11: han bruker BE mindre. Time 14: anbefaler BE etter TP1 for fire-delers varianten. Hva følger du i en øving?",
    context:
      "Kilde og valgt managementvariant skal være synlige før resultatet.",
    options: options(
      "named|Den navngitte varianten og dens konkrete instruksjon",
      "never|Aldri BE i noen RR-variant",
      "always|Alltid BE på et vilkårlig tidspunkt",
    ),
    correct: "named",
    explanation:
      "Ulike uttalelser kan beskrive ulike valg og tider. Ikke skriv om alle tidligere eksempler til én fast regel. BE ved entry fjerner heller ikke spread, slippage, gebyrer eller utførelsesrisiko.",
    limit:
      "Hans ord om «risk-free» er ikke en matematisk garanti. Oppgaven skiller kildens instrukser fra den garantien.",
    refs: [ref(11, 1503, 1608), ref(14, 1680, 1800), ref(1, 1157, 1350)],
  },
  {
    id: "layers",
    module: 7,
    title: "Hold høyere sells, lukk lavere",
    scene: "protected",
    question:
      "Den konkrete instruksen er å beholde høyere sell-fyllinger og lukke de lavere. Trykk på den inngangen som skal beholdes.",
    context:
      "Dette er en øvelse i forklaringen hans, ikke en ordre til din broker eller et nytt signal.",
    options: options(
      "A|A · høyere sell-entry",
      "B|B · lavere sell-entry",
      "all|Alle posisjoner uansett hvilket oppsett",
    ),
    correct: "A",
    explanation:
      "En høyere sell-entry er den bedre inngangen ved samme aktuelle pris. Han forklarer lagene i time 11. En oppdatert instruks gjelder de identifiserte lagene i det konkrete oppsettet, ikke alle trades.",
    limit:
      "Ordlyd alene uten nøyaktig nivå og opprinnelse gir ikke en universell automatisk selektor.",
    refs: [ref(11, 2049, 2150), ref(1, 1157, 1280)],
  },
  {
    id: "wait",
    module: 7,
    title: "Når han selv velger å vente",
    scene: "inside",
    question:
      "Eksemplet er trang konsolidering før en stor nyhet, uten den ønskede ekspansjonen. Hvilket valg beskriver han i time 8?",
    context: "Dette er akkurat eksemplet der han står utenfor.",
    options: options(
      "wait|Vent · ingen tvungen entry",
      "every|Handle hver FVG uansett",
      "ban|RR har et universelt forbud mot alle nyhetstrades",
    ),
    correct: "wait",
    explanation:
      "Han venter fordi området og retningen ikke gir den ønskede ekspansjonen. En annen time omtaler aggressiv nyhetshandel som en separat stil. Venteksemplet er ikke bevis på ett universelt nyhetsfilter.",
    limit:
      "Å hoppe over en bevegelse er tillatt. En senere stor candle gjør ikke en manglende forhåndsbekreftelse til en feil.",
    refs: [ref(8, 944, 1060), ref(5, 2805, 3000)],
  },
  {
    id: "loss",
    module: 7,
    title: "Ta med setupet som tapte",
    scene: "loss",
    question:
      "I time 7 kunngjør han en live sell, men rapporterer stop-out ved 41:57. Hva må en ærlig gjennomgang beholde?",
    context:
      "Den planlagte ideen og det senere utfallet vurderes hver for seg.",
    options: options(
      "keep|Både forhåndsplanen og tapet",
      "erase|Fjern tapet · den senere retningen teller",
      "proof|Ett tap beviser at alle regler er feil",
    ),
    correct: "keep",
    explanation:
      "Liveforsøket som stoppes ut er relevant motvekt til utvalgte vellykkede tilbakeblikk. Tapet må registreres. Det alene avgjør ikke kvaliteten på alle forhåndsvurderingene eller samlet forventningsverdi.",
    limit:
      "Påståtte pipstotaler og en valgt serie vinnere er ikke en revidert fillbasert lønnsomhetsstatistikk.",
    refs: [ref(7, 1645, 1685), ref(7, 2517, 2548), ref(3, 129, 300)],
  },
  {
    id: "whole-method",
    module: 7,
    title: "Hva er faktisk forklart – og hva mangler?",
    scene: "range",
    question:
      "Ved 30:18 i time 14 sier han at sendingene viser deler av konfluensen. Kan dette kurset ærlig fylle resten med egne regler og kalle det hele hans strategi?",
    context: "Dette er grensen for hva tilgjengelige kilder kan dokumentere.",
    options: options(
      "no|Nei · behold de dokumenterte variantene og vis hullene",
      "invent|Ja · finn på terskler for å få en komplett fasit",
      "profit|Ja · vinnende eksempler avslører alle reglene",
    ),
    correct: "no",
    explanation:
      "Kurset dekker det som forklares i de tolv tilgjengelige RR-opptakene, nummerert 1–11 og 14. Det kan ikke erstatte uunderviste detaljer med egne regler og samtidig tilskrive dem Jake.",
    limit:
      "Uavklart: full rangering av soner, universelle tid/DST-ankre, uttømmende totrinns SMT, alle modellterskler og én permanent exitpolicy. Opptak 12/13 var ikke oppført i arkivene ved kontrollen.",
    refs: [ref(14, 1803, 1858), ref(9, 1733, 1840)],
  },
];

// Additional source-specific alternatives; these are not universal entry requirements.
RR_SOURCE_TASKS.splice(
  RR_SOURCE_TASKS.findIndex((t) => t.id === "two-stage"),
  0,
  {
    id: "smt-optional",
    module: 5,
    title: "Må alle innganger ha SMT?",
    scene: "smt",
    question:
      "I time 4 sier han at en bestemt sterk sone ble handlet uten SMT. Hvilken konklusjon følger?",
    context:
      "Skill modellen som bruker SMT fra den konkrete sonevarianten han også viser.",
    options: options(
      "optional|SMT er støtte i noen modeller, ikke dokumentert som krav i alle",
      "always|Alle RR-innganger må ha totrinns SMT",
      "useless|SMT har ingen rolle i noen modell",
    ),
    correct: "optional",
    explanation:
      "Ved 49:34 sier Jake at dette soneeksemplet ikke trengte SMT. Andre eksempler bygger aktivt på SMT. Derfor må det fremgå hvilken modell du øver på, fremfor å slå sammen alle konfluensene til en universell sjekkliste.",
    limit:
      "Han gir ikke en fullstendig objektiv regel for når en sone er sterk nok til å brukes uten SMT.",
    refs: [ref(4, 2974, 3035), ref(8, 1449, 1505)],
  },
);
RR_SOURCE_TASKS.splice(
  RR_SOURCE_TASKS.findIndex((t) => t.id === "four-tp"),
  0,
  {
    id: "tp1-context",
    module: 7,
    title: "TP1 er strukturelt og kontekstavhengig",
    scene: "targets",
    question:
      "Time 14: han forsøker ofte 1,5–2R til TP1, men nevner 1R når rangen ikke støtter mer. Hva gjør du med et nærmere motstående nivå?",
    context:
      "Dette spør om begrunnelsen hans, ikke et fast minste-R-filter i appen.",
    options: options(
      "context|Undersøk rangen og nivået før du antar et fjernere mål",
      "fixed|Tving alltid TP1 til minst 2R",
      "one|Flytt alltid TP1 til nøyaktig 1R",
    ),
    correct: "context",
    explanation:
      "Ved 29:10 forklarer han ønsket om større TP1, men også unntaket når rangen ikke støtter det. I time 2 tegner han mål ved konkrete strukturpunkter. Et ønsket R-tall er ikke bevis på at markedet har plass til målet.",
    limit:
      "Ingen fast målrekke eller sikkert minste-R-filter tilskrives hele strategien hans.",
    refs: [ref(14, 1745, 1800), ref(2, 2134, 2187)],
  },
);

export const rrAnswerSchema = z
  .object({
    choice: z.string().max(60).optional(),
    values: z
      .record(
        z.string().max(30),
        z.number().finite().min(-1000000).max(1000000),
      )
      .optional(),
  })
  .strict();
export type RRSourceAnswer = z.infer<typeof rrAnswerSchema>;
export function checkRRSource(task: SourceTask, answer: RRSourceAnswer) {
  if (task.targets)
    return task.targets.map((t) => {
      const value = answer.values?.[t.id];
      return task.id === "c2-stop"
        ? {
            pass:
              typeof value === "number" &&
              Number.isFinite(value) &&
              value >= 0 &&
              value < 20,
            text: "Denne C3-varianten krever SL under C2-low 20 på diagrammet. 18 er bare vist som eksempel, ikke en fast buffer. Andre stops under 20 kan også oppfylle denne avgrensede prisbetingelsen.",
          }
        : {
            pass: Math.abs((value ?? Infinity) - t.value) <= 2,
            text:
              t.label +
              ": " +
              t.value +
              " på diagrammets indeks. " +
              task.limit,
          };
    });
  if (task.numeric)
    return task.numeric.map((t) => ({
      pass:
        Math.abs((answer.values?.[t.id] ?? Infinity) - t.correct) <=
        t.tolerance,
      text: `${t.label}: ${t.correct} ${t.unit}.`,
    }));
  return [{ pass: answer.choice === task.correct, text: task.explanation }];
}
export const rrAttemptSchema = z.object({
  id: z.string().max(100),
  taskId: z.string().max(70),
  at: z.number().finite().positive(),
  guided: z.boolean(),
  answer: rrAnswerSchema,
});
export const rrSourceProgressSchema = z.object({
  version: z.literal(RR_SOURCE_VERSION),
  selected: z.string().max(70),
  guided: z.boolean(),
  activeAttempt: z.string().max(100).nullable().default(null),
  attempts: z.array(rrAttemptSchema).max(500),
});
export type RRSourceProgress = z.infer<typeof rrSourceProgressSchema>;
export function freshRRSource(): RRSourceProgress {
  return {
    version: RR_SOURCE_VERSION,
    selected: RR_SOURCE_TASKS[0].id,
    guided: true,
    activeAttempt: null,
    attempts: [],
  };
}
export function restoreRRSource(raw: unknown): RRSourceProgress {
  const p = rrSourceProgressSchema.parse(raw);
  if (
    !RR_SOURCE_TASKS.some((t) => t.id === p.selected) ||
    p.attempts.some((a) => !RR_SOURCE_TASKS.some((t) => t.id === a.taskId))
  )
    throw Error("Ukjent RR-kildeoppgave i progresjonen.");
  if (
    p.activeAttempt &&
    !p.attempts.some(
      (a) =>
        a.id === p.activeAttempt &&
        a.taskId === p.selected &&
        a.guided === p.guided,
    )
  )
    throw Error("Ugyldig låst RR-forsøk.");
  return p;
}
export function sourceProgressCount(p: RRSourceProgress) {
  return RR_SOURCE_TASKS.filter((t) =>
    p.attempts.some(
      (a) =>
        a.taskId === t.id &&
        !a.guided &&
        checkRRSource(t, a.answer).every((c) => c.pass),
    ),
  ).length;
}
export function mergeRRSource(
  current: RRSourceProgress,
  imported: RRSourceProgress,
): RRSourceProgress {
  return {
    ...current,
    attempts: [
      ...new Map(
        [...current.attempts, ...imported.attempts].map((a) => [a.id, a]),
      ).values(),
    ]
      .sort((a, b) => a.at - b.at)
      .slice(-500),
  };
}

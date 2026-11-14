import { useEffect, useRef, useState } from "react";
import { Play, X } from "lucide-react";

const guides = [
  {
    title: "C1, C2 og C3 – enkelt forklart",
    src: new URL(
      "../../assets/guides/RETRACE-C1-C2-C3-norsk.mp4",
      import.meta.url,
    ).href,
    poster: new URL(
      "../../assets/guides/RETRACE-C1-C2-C3-norsk-poster.jpg",
      import.meta.url,
    ).href,
    captions: new URL(
      "../../assets/guides/RETRACE-C1-C2-C3-norsk.vtt?no-inline",
      import.meta.url,
    ).href,
  },
  {
    title: "Slik bruker du RETRACE",
    src: new URL(
      "../../assets/guides/RETRACE-kom-i-gang-norsk.mp4",
      import.meta.url,
    ).href,
    poster: new URL(
      "../../assets/guides/RETRACE-kom-i-gang-norsk-poster.jpg",
      import.meta.url,
    ).href,
    captions: new URL(
      "../../assets/guides/RETRACE-kom-i-gang-norsk.vtt?no-inline",
      import.meta.url,
    ).href,
  },
];

export function VideoGuides({ norwegian }: { norwegian: boolean }) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState(0);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (!open) return;
    const current = dialog.current;
    current?.showModal();
    return () => current?.close();
  }, [open]);
  return (
    <>
      <button className="rr-open-guides" onClick={() => setOpen(true)}>
        <Play size={15} />
        {norwegian ? "Se videoguidene" : "Video guides · Norwegian"}
      </button>
      {open && (
        <dialog
          ref={dialog}
          className="rr-guide-dialog"
          aria-labelledby="rr-video-heading"
          onCancel={(e) => {
            e.preventDefault();
            setOpen(false);
          }}
          onKeyDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            if (e.target === dialog.current) setOpen(false);
          }}
        >
          <header>
            <div>
              <span>RETRACE</span>
              <h2 id="rr-video-heading">
                {norwegian ? "Videoguider" : "Video guides"}
              </h2>
            </div>
            <button
              autoFocus
              aria-label={
                norwegian ? "Lukk videoguidene" : "Close video guides"
              }
              onClick={() => setOpen(false)}
            >
              <X size={21} />
            </button>
          </header>
          <nav
            aria-label={norwegian ? "Velg videoguide" : "Choose video guide"}
          >
            {guides.map((guide, index) => (
              <button
                key={guide.src}
                aria-pressed={selected === index}
                className={selected === index ? "selected" : ""}
                onClick={() => setSelected(index)}
              >
                <span>{index + 1}</span>
                {guide.title}
              </button>
            ))}
          </nav>
          <video
            key={guides[selected].src}
            src={guides[selected].src}
            poster={guides[selected].poster}
            controls
            preload="metadata"
            playsInline
            aria-label={guides[selected].title}
          >
            <track
              kind="captions"
              src={guides[selected].captions}
              srcLang="nb"
              label="Norsk"
            />
          </video>
          <p>
            {norwegian
              ? "Ekte skjermbilder og replay fra RETRACE, med norsk tale og stor tekst. Bruk fullskjermknappen for et større bilde. Videoene følger med appen og virker uten nett."
              : "Real RETRACE screenshots and replay, with Norwegian narration and large captions. Use the fullscreen control for a larger picture. The videos are included and work offline."}
          </p>
        </dialog>
      )}
    </>
  );
}

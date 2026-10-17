import StatusBadge from "@/components/StatusBadge";
import { formatNaira } from "@/lib/money";
import { OFFERING_STATUSES } from "@/types";

/*
  Proof that the skeleton stands up: IBM Plex Sans is rendering, the theme
  tokens resolve, a Naira figure carries tabular numerals, the status chips look
  the way the deck specifies, and a touch target is at least 48px.

  Not a screen. Piece 2 replaces this route with Offering Entry. Every figure
  below is invented.
*/
const ThemeCheckPage = () => {
  // Invented kobo figures, in the shape the server returns them.
  const sampleAmountsKobo = [8_880_000, 1_250_050, 4_830_000, 0];

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-1">
        <h1 className="text-page-title">Theme check</h1>
        <p className="text-secondary text-ink-3">
          The skeleton only. No screen is built yet.
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-section-label uppercase text-ink-4">Offering status</h2>
        <div className="flex flex-wrap items-center gap-2">
          {OFFERING_STATUSES.map((status) => (
            <StatusBadge key={status} status={status} />
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {OFFERING_STATUSES.map((status) => (
            <StatusBadge key={status} status={status} small />
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-section-label uppercase text-ink-4">Amounts</h2>
        <div className="rounded-card border border-line bg-surface">
          {sampleAmountsKobo.map((amountKobo, index) => (
            <div
              key={amountKobo}
              className={`flex items-center justify-between px-4 py-3.5 ${
                index === 0 ? "" : "border-t border-line-2"
              }`}
            >
              <span className="text-row-title">Invented figure</span>
              <span className="money text-kv">{formatNaira(amountKobo)}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-section-label uppercase text-ink-4">Type and targets</h2>
        <p className="text-body text-ink-2">
          Body text at 17px, so it is readable on a mid-range phone in daylight.
        </p>
        <p className="text-hint text-ink-5">Hint text at 13px.</p>
        <button
          type="button"
          className="h-control min-h-touch rounded-card border-control border-accent-blue bg-accent-blue px-5 text-button text-surface"
        >
          A 52px button
        </button>
      </section>
    </div>
  );
};

export default ThemeCheckPage;

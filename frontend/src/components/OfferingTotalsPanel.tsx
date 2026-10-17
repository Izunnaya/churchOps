import Money from "@/components/Money";
import type { OfferingTotals } from "@/types";

/*
  Every figure here comes from the server. The treasurer never types a total at
  any level, and nothing on this panel is editable.

  Note what is deliberately absent: there is no "discrepancy" or "does not
  balance" state. Cash and the offering total differ whenever a transfer is
  present, which is normal, and the design is explicit that it must never be
  shown as an error. Where both are present this says why, in plain words.
*/
type Props = {
  totals: OfferingTotals;
  hasRevisions: boolean;
  /// The counted total before any correction. Shown beside the revised total,
  /// never replaced by it.
  originalTotalKobo: number;
  revisedTotalKobo: number;
};

const OfferingTotalsPanel = ({
  totals,
  hasRevisions,
  originalTotalKobo,
  revisedTotalKobo,
}: Props) => {
  const hasCashAndTransfers = totals.cashTotalKobo > 0 && totals.transferTotalKobo > 0;

  return (
    <section
      aria-labelledby="offering-totals-heading"
      className="rounded-card border border-line bg-surface"
    >
      <h2
        id="offering-totals-heading"
        className="border-b border-line-2 px-4 py-3 text-section-label uppercase text-ink-4"
      >
        Totals
      </h2>

      <dl className="divide-y divide-line-2">
        <TotalRow label="Cash counted" amountKobo={totals.cashTotalKobo} />
        <TotalRow label="Transfers" amountKobo={totals.transferTotalKobo} />
        <TotalRow label="Offering total" amountKobo={totals.categoriesTotalKobo} emphasis />
        <TotalRow label="Set aside" amountKobo={totals.bucketTotalKobo} />
        <TotalRow label="Usable income" amountKobo={totals.usableIncomeKobo} emphasis />
      </dl>

      {hasCashAndTransfers && (
        <p className="border-t border-line-2 bg-sunken px-4 py-2 text-hint text-ink-3">
          Cash counted is lower than the offering total because transfers have no
          cash behind them. That is expected.
        </p>
      )}

      {hasRevisions && (
        <div className="border-t border-line-2 px-4 py-3">
          <p className="text-section-label uppercase text-ink-4">After correction</p>
          <dl className="mt-2 divide-y divide-line-2">
            <TotalRow label="Originally counted" amountKobo={originalTotalKobo} />
            <TotalRow label="Revised total" amountKobo={revisedTotalKobo} emphasis />
          </dl>
        </div>
      )}
    </section>
  );
};

/*
  Module-private, and seven callers in this file. It stays here rather than in
  components/ because a totals row is not a thing any other screen composes —
  it is the shape of this panel's own rows.
*/
type TotalRowProps = {
  label: string;
  amountKobo: number;
  emphasis?: boolean;
};

const TotalRow = ({ label, amountKobo, emphasis = false }: TotalRowProps) => {
  return (
    <div className="flex items-baseline justify-between gap-4 px-4 py-2.5">
      <dt className={emphasis ? "text-row-title text-ink" : "text-body text-ink-3"}>
        {label}
      </dt>
      <dd>
        <Money
          amountKobo={amountKobo}
          className={emphasis ? "text-kv text-ink" : "text-body text-ink-2"}
        />
      </dd>
    </div>
  );
};

export default OfferingTotalsPanel;

import { Minus, Plus } from "lucide-react";
import Money from "@/components/Money";
import { DENOMINATIONS, type Denomination } from "@/config/denominations-config";
import { denominationLineKobo } from "@/lib/money";

/*
  The note count for one cash category, high note to low — the order a stack is
  sorted into before it is counted.

  The treasurer types a quantity, never a total. Each row shows what that row of
  notes comes to, and the card above sums them; nothing here is typed as money.
  The steppers exist because entering "7" with a thumb on a phone, standing at a
  counting table, is slower and more error-prone than tapping twice.
*/

/// The server's validator is `z.number().int().min(0).max(100_000)`. Clamping
/// here means she cannot type a number the save would reject.
const MAX_NOTE_QUANTITY = 100_000;

const clampQuantity = (value: number): number => {
  if (!Number.isFinite(value)) return 0;
  return Math.min(MAX_NOTE_QUANTITY, Math.max(0, Math.trunc(value)));
};

type Props = {
  quantityByDenomination: Record<Denomination, number>;
  onQuantityChange: (denomination: Denomination, quantity: number) => void;
  disabled?: boolean;
};

const DenominationStepper = ({
  quantityByDenomination,
  onQuantityChange,
  disabled = false,
}: Props) => {
  return (
    <ul className="divide-y divide-line-2">
      {DENOMINATIONS.map((denomination) => {
        const quantity = quantityByDenomination[denomination];
        // A face value rendered as money: one note of this denomination.
        const noteValueKobo = denominationLineKobo(denomination, 1);

        return (
          <li
            key={denomination}
            className="flex items-center gap-3 py-2 first:pt-0 last:pb-0"
          >
            <Money
              amountKobo={noteValueKobo}
              className="w-16 shrink-0 text-row-title text-ink-2"
            />

            <div className="flex items-center gap-1">
              <button
                type="button"
                disabled={disabled || quantity === 0}
                onClick={() => onQuantityChange(denomination, clampQuantity(quantity - 1))}
                aria-label={`One fewer ${formatNoteName(denomination)} note`}
                className="flex size-touch items-center justify-center rounded-card border-control border-line-3 bg-surface text-ink-2 disabled:text-ink-6"
              >
                <Minus aria-hidden="true" className="size-4" />
              </button>

              <input
                type="text"
                inputMode="numeric"
                disabled={disabled}
                value={String(quantity)}
                onChange={(changeEvent) =>
                  onQuantityChange(
                    denomination,
                    clampQuantity(Number(changeEvent.target.value.replace(/\D/g, ""))),
                  )
                }
                aria-label={`How many ${formatNoteName(denomination)} notes`}
                className="h-touch w-16 rounded-card border-control border-line-3 bg-surface text-center money text-ink disabled:bg-sunken disabled:text-ink-3"
              />

              <button
                type="button"
                disabled={disabled || quantity >= MAX_NOTE_QUANTITY}
                onClick={() => onQuantityChange(denomination, clampQuantity(quantity + 1))}
                aria-label={`One more ${formatNoteName(denomination)} note`}
                className="flex size-touch items-center justify-center rounded-card border-control border-line-3 bg-surface text-ink-2 disabled:text-ink-6"
              >
                <Plus aria-hidden="true" className="size-4" />
              </button>
            </div>

            <Money
              amountKobo={denominationLineKobo(denomination, quantity)}
              className="ml-auto text-row-title text-ink"
            />
          </li>
        );
      })}
    </ul>
  );
};

/// For the screen reader only: "₦1,000" read aloud as a label is clearer spoken
/// as the note's name.
const formatNoteName = (denomination: number): string =>
  `${denomination.toLocaleString("en-NG")} naira`;

export default DenominationStepper;

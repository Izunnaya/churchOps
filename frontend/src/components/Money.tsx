import { cn } from "@/lib/utils";
import { formatNaira } from "@/lib/money";

/*
  Every Naira figure on screen goes through this. It exists so the `money`
  utility — tabular numerals — cannot be forgotten on one figure in one column,
  which is exactly the kind of omission nobody notices until a report prints
  with the thousands out of line.

  It takes kobo, because that is what the server sends. There is no prop for a
  naira value: converting before rendering would put the unit change back in
  the callers, which is the mistake lib/money.ts exists to prevent.
*/
type Props = {
  amountKobo: number;
  className?: string;
};

const Money = ({ amountKobo, className }: Props) => {
  return <span className={cn("money", className)}>{formatNaira(amountKobo)}</span>;
};

export default Money;

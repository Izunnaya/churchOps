import { CheckCircle2, History, Lock, Pencil } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { OfferingStatus } from "@/types";

/*
  Status is an icon and a word. The colour reinforces it and never carries it on
  its own — many of the people reading this are over 50, some on a bright phone
  screen outdoors, and the design spec is explicit that colour alone is not a
  status.

  Only the four OfferingStatus values the server has are here. The design deck's
  chip table also specifies returned, waiting, due, comment and none; those
  belong to department reports, expenses and approvals, which do not exist yet,
  so they are deliberately left out rather than guessed at.
*/
const CHIPS: Record<
  OfferingStatus,
  { label: string; icon: LucideIcon; classes: string }
> = {
  DRAFT: {
    label: "Draft",
    icon: Pencil,
    classes:
      "bg-status-draft-bg border-status-draft-border text-status-draft-ink",
  },
  FINALIZED: {
    label: "Finalized",
    icon: Lock,
    classes:
      "bg-status-finalized-bg border-status-finalized-border text-status-finalized-ink",
  },
  APPROVED: {
    label: "Approved",
    icon: CheckCircle2,
    classes:
      "bg-status-approved-bg border-status-approved-border text-status-approved-ink",
  },
  REVISED: {
    label: "Revised",
    icon: History,
    classes:
      "bg-status-revised-bg border-status-revised-border text-status-revised-ink",
  },
};

type Props = {
  status: OfferingStatus;
  /// The dense variant used inside list rows and table cells.
  small?: boolean;
  className?: string;
};

const StatusBadge = ({ status, small = false, className }: Props) => {
  const chip = CHIPS[status];
  const Icon = chip.icon;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-pill border whitespace-nowrap",
        small ? "px-[9px] py-[3px] text-chip-small" : "px-[11px] py-[5px] text-chip",
        chip.classes,
        className,
      )}
    >
      <Icon
        aria-hidden="true"
        strokeWidth={2}
        className={small ? "size-3 shrink-0" : "size-3.5 shrink-0"}
      />
      {chip.label}
    </span>
  );
};

export default StatusBadge;

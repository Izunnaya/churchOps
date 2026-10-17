/*
  The shapes the server actually returns and accepts today, transcribed from
  server/src/modules/offerings/offerings.service.ts (`presentOffering`),
  offerings.router.ts, incomeCategories.router.ts, server/src/domain/offering.ts
  and server/prisma/schema.prisma.

  Two rules run through every type here, and they are not symmetrical:

  1. A response carries money as a whole number of kobo, and the field name ends
     `Kobo`. Never a float, never a formatted string. Naira only ever exist on
     screen, produced at render time.
  2. A request carries money as a naira string, because that is what the
     treasurer typed and what the server's validators accept. Request and
     response types therefore stay separate and are never unified.
*/

import type { Denomination } from "@/config/denominations-config";

// --- Enums, mirrored from server/prisma/schema.prisma --------------------

export const OFFERING_STATUSES = ["DRAFT", "FINALIZED", "APPROVED", "REVISED"] as const;
export type OfferingStatus = (typeof OFFERING_STATUSES)[number];

export type Role = "TREASURER" | "SECRETARY" | "PASTOR" | "DEPARTMENT_LEADER" | "USHER";

export type ServiceKind =
  | "SUNDAY_FIRST"
  | "SUNDAY_SECOND"
  | "MIDWEEK"
  | "VIGIL"
  | "CONVENTION"
  | "SPECIAL";

export type UserStatus =
  | "PENDING_VERIFICATION"
  | "PENDING_APPROVAL"
  | "ACTIVE"
  | "DISABLED";

// --- Envelope ------------------------------------------------------------

/// Every successful response is wrapped. The list endpoint adds `page`.
export type Envelope<T> = { data: T };

export type Page = { total: number; take: number; skip: number };

export type PagedEnvelope<T> = { data: T; page: Page };

/// What errorHandler.ts returns on every failure, whatever went wrong.
export type ErrorEnvelope = {
  error: {
    code: string;
    message: string;
    /// Validation failures carry `{ fields: { "name": "Give the category a name" } }`.
    details?: { fields?: Record<string, string> } & Record<string, unknown>;
  };
};

// --- Shared fragments ----------------------------------------------------

/// Everyone the server names on a record. Null wherever the account has since
/// been removed — the relations are `onDelete: SetNull`.
export type PersonRef = { id: string; fullName: string };

export type ServiceRef = {
  id: string;
  name: string;
  kind: ServiceKind;
  /// ISO 8601. The service date is the only date an offering has.
  heldOn: string;
};

// --- Offering: responses -------------------------------------------------

export type DenominationLine = {
  /// A naira face value, not kobo. Left as `number` rather than narrowed to
  /// `Denomination`: the server is the source of what it sends, and a figure
  /// already saved must still render if the note list ever changes.
  denomination: number;
  quantity: number;
  /// denomination * 100 * quantity, in kobo. The server computes it; the device
  /// may show the same arithmetic provisionally while counting.
  lineTotalKobo: number;
};

/*
  The three bucket fields are ABSENT, not null, unless the caller is Treasurer
  or Pastor — `presentOffering` spreads them in conditionally. A Secretary's
  response omits the keys entirely, which is why they are optional here rather
  than nullable. `bucketRatePercent` is itself nullable for a category the rate
  table does not cover.

  The offering-level `totals` below are deliberately NOT gated the same way.
*/
export type OfferingCategoryRow = {
  id: string;
  name: string;
  isCash: boolean;
  /// What this category is worth, however it arrived.
  amountKobo: number;
  /// Counted note by note. Zero for a transfer category.
  cashTotalKobo: number;
  /// No physical cash behind it. Zero for a cash category.
  transferTotalKobo: number;
  denominations: DenominationLine[];

  /// Treasurer and Pastor only. Always two decimals as a string — "10.00",
  /// never 10 and never a number — or null.
  bucketRatePercent?: string | null;
  bucketDeductionKobo?: number;
  netAmountKobo?: number;
};

export type OfferingTotals = {
  cashTotalKobo: number;
  transferTotalKobo: number;
  /// Cash and transfers together. This is the offering's total.
  categoriesTotalKobo: number;
  /// Set aside into the contingency bucket. Visible to all three viewing roles
  /// by decision (CONVENTIONS section 6), unlike the per-category fields above.
  bucketTotalKobo: number;
  usableIncomeKobo: number;
};

export type OfferingRevision = {
  id: string;
  reason: string;
  categoryName: string | null;
  /// Signed: a correction can take money off as well as add it.
  deltaAmountKobo: number;
  originalTotalKobo: number;
  revisedTotalKobo: number;
  /// ISO 8601.
  recordedAt: string;
  recordedBy: PersonRef | null;
};

export type OfferingComment = {
  id: string;
  body: string;
  author: PersonRef;
  createdAt: string;
  readAt: string | null;
};

export type Offering = {
  id: string;
  status: OfferingStatus;
  notes: string | null;
  service: ServiceRef;
  categories: OfferingCategoryRow[];
  totals: OfferingTotals;
  revisions: OfferingRevision[];
  /// The counted total, before any revision. Shown beside revisedTotalKobo
  /// wherever the record has been revised — never replaced by it.
  originalTotalKobo: number;
  revisedTotalKobo: number;
  hasRevisions: boolean;
  recordedBy: PersonRef | null;
  finalizedBy: PersonRef | null;
  finalizedAt: string | null;
  approvedBy: PersonRef | null;
  approvedAt: string | null;
  comments: OfferingComment[];
  createdAt: string;
  updatedAt: string;
};

// --- Offering: requests --------------------------------------------------

/// Matches the server's `status`, `take` and `skip` query validators.
export type OfferingListQuery = {
  status?: OfferingStatus;
  /// 1–100. The server defaults to 25.
  take?: number;
  /// The server defaults to 0.
  skip?: number;
};

export type CreateOfferingRequest = { serviceId: string };

export type AddOfferingCategoryRequest = {
  name: string;
  /// Defaults to true on the server. A cash category's total comes from its
  /// note counts; a transfer category must carry transferAmount instead.
  isCash?: boolean;
  /// A naira amount as typed, matching the server's /^\d+(\.\d{1,2})?$/ —
  /// "3500" or "3500.00". Unsigned.
  transferAmount?: string;
};

export type UpdateOfferingCategoryRequest = {
  name?: string;
  /// A naira amount as typed, matching the server's /^\d+(\.\d{1,2})?$/ —
  /// "3500" or "3500.00". Unsigned. Rejected by the server on a cash category.
  transferAmount?: string;
  /*
    Replaced wholesale for the category. Rejected on a transfer category.

    `denomination` is a naira face value from DENOMINATIONS, not a number: the
    server refuses any other value, and a ₦25 note that type-checks here is a
    400 the treasurer meets in the middle of a count. `quantity` is how many of
    that note, 0 to 100,000.
  */
  denominations?: { denomination: Denomination; quantity: number }[];
};

export type AddOfferingCommentRequest = { body: string };

export type RecordRevisionRequest = {
  reason: string;
  /*
    Which category the correction is against, when it is against one. Omitted,
    never null: the server's validator is `z.string().trim().min(1).optional()`,
    so an explicit null is refused with a 400.
  */
  categoryName?: string;
  /// A signed naira amount as typed, matching /^-?\d+(\.\d{1,2})?$/ — a
  /// correction can take money off as well as add it.
  deltaAmount: string;
  /*
    Required, and a UUID. It belongs to the correction, not to the attempt: the
    same key must be sent again on a retry of the same correction, or the
    mechanism does nothing. A different correction gets a new key.
  */
  idempotencyKey: string;
};

/// The revision endpoint answers 201 when it recorded one and 200 when the key
/// replayed one already recorded. The difference is what the toast must say.
export type RevisionOutcome = {
  offering: Offering;
  /// False when this request added nothing because the key had been used.
  created: boolean;
};

// --- Income categories ---------------------------------------------------

/// The treasurer-maintained category list, which is also the bucket rate table.
export type IncomeCategory = {
  id: string;
  name: string;
  isCashByDefault: boolean;
  /// Two decimals as a string, or null for a category that is not bucketed.
  bucketRatePercent: string | null;
  sortOrder: number;
  active: boolean;
};

export type CreateIncomeCategoryRequest = {
  name: string;
  isCashByDefault?: boolean;
  /*
    A percentage as written, matching /^\d{1,3}(\.\d{1,2})?$/ — "10" or "12.5".
    A rate is not money, so it is not kobo. It always comes BACK as two
    decimals. Null for a category the bucket does not touch, and the server
    accepts the null here: its validator is `.nullish()`, unlike the revision's
    categoryName above.
  */
  bucketRatePercent?: string | null;
};

export type UpdateIncomeCategoryRequest = {
  name?: string;
  isCashByDefault?: boolean;
  /// As on create: /^\d{1,3}(\.\d{1,2})?$/, or null to stop bucketing this
  /// category. The server's validator is `.nullish()`, so null is accepted.
  bucketRatePercent?: string | null;
  active?: boolean;
  sortOrder?: number;
};

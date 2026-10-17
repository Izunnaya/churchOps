/*
  A compile-time check, not a runtime one. The backend is unreachable in this
  slice, so nothing here proves a request succeeds. What it does prove is
  mechanical: the shapes in frontend/src/types.ts are the shapes the server's
  own code is inferred to produce.

  Dates are the one deliberate transform. Prisma hands `presentOffering` a
  `Date`; `res.json` turns it into an ISO string before the client sees it.
  `Jsonified` applies that one rule and nothing else.
*/

import type { presentOffering } from "../../server/src/modules/offerings/offerings.service";
import type { DENOMINATIONS as SERVER_DENOMINATIONS } from "../../server/src/domain/offering";
import type {
  OfferingStatus as ServerOfferingStatus,
  Role as ServerRole,
  ServiceKind as ServerServiceKind,
  UserStatus as ServerUserStatus,
} from "../../server/src/generated/prisma/enums";
import type { Denomination } from "../src/config/denominations-config";
import type {
  Offering,
  OfferingStatus,
  Role,
  ServiceKind,
  UserStatus,
} from "../src/types";

type Jsonified<T> = T extends Date
  ? string
  : T extends (infer Element)[]
    ? Jsonified<Element>[]
    : T extends object
      ? { [Key in keyof T]: Jsonified<T[Key]> }
      : T;

type ServerOffering = Jsonified<Awaited<ReturnType<typeof presentOffering>>>;

type Exactly<Left, Right> = [Left] extends [Right]
  ? [Right] extends [Left]
    ? true
    : { serverShapeNotAssignableToClient: Right }
  : { clientShapeNotAssignableToServer: Left };

type Assert<T extends true> = T;

// --- enums ----------------------------------------------------------------

export type OfferingStatusMatches = Assert<Exactly<OfferingStatus, ServerOfferingStatus>>;
export type RoleMatches = Assert<Exactly<Role, ServerRole>>;
export type ServiceKindMatches = Assert<Exactly<ServiceKind, ServerServiceKind>>;
export type UserStatusMatches = Assert<Exactly<UserStatus, ServerUserStatus>>;
export type DenominationsMatch = Assert<
  Exactly<Denomination, (typeof SERVER_DENOMINATIONS)[number]>
>;


// --- the offering response, field by field so a failure names the field ---

export type Match_id = Assert<Exactly<Offering["id"], ServerOffering["id"]>>;
export type Match_status = Assert<Exactly<Offering["status"], ServerOffering["status"]>>;
export type Match_notes = Assert<Exactly<Offering["notes"], ServerOffering["notes"]>>;
export type Match_service = Assert<Exactly<Offering["service"], ServerOffering["service"]>>;
export type Match_categories = Assert<Exactly<Offering["categories"], ServerOffering["categories"]>>;
export type Match_totals = Assert<Exactly<Offering["totals"], ServerOffering["totals"]>>;
export type Match_revisions = Assert<Exactly<Offering["revisions"], ServerOffering["revisions"]>>;
export type Match_originalTotalKobo = Assert<Exactly<Offering["originalTotalKobo"], ServerOffering["originalTotalKobo"]>>;
export type Match_revisedTotalKobo = Assert<Exactly<Offering["revisedTotalKobo"], ServerOffering["revisedTotalKobo"]>>;
export type Match_hasRevisions = Assert<Exactly<Offering["hasRevisions"], ServerOffering["hasRevisions"]>>;
export type Match_recordedBy = Assert<Exactly<Offering["recordedBy"], ServerOffering["recordedBy"]>>;
export type Match_finalizedBy = Assert<Exactly<Offering["finalizedBy"], ServerOffering["finalizedBy"]>>;
export type Match_finalizedAt = Assert<Exactly<Offering["finalizedAt"], ServerOffering["finalizedAt"]>>;
export type Match_approvedBy = Assert<Exactly<Offering["approvedBy"], ServerOffering["approvedBy"]>>;
export type Match_approvedAt = Assert<Exactly<Offering["approvedAt"], ServerOffering["approvedAt"]>>;
export type Match_comments = Assert<Exactly<Offering["comments"], ServerOffering["comments"]>>;
export type Match_createdAt = Assert<Exactly<Offering["createdAt"], ServerOffering["createdAt"]>>;
export type Match_updatedAt = Assert<Exactly<Offering["updatedAt"], ServerOffering["updatedAt"]>>;

// --- drilling into the one field that does not match ---------------------

type ServerCategoryRow = ServerOffering["categories"][number];
type ClientCategoryRow = Offering["categories"][number];

export type Cat_id = Assert<Exactly<ClientCategoryRow["id"], ServerCategoryRow["id"]>>;
export type Cat_name = Assert<Exactly<ClientCategoryRow["name"], ServerCategoryRow["name"]>>;
export type Cat_isCash = Assert<Exactly<ClientCategoryRow["isCash"], ServerCategoryRow["isCash"]>>;
export type Cat_amountKobo = Assert<Exactly<ClientCategoryRow["amountKobo"], ServerCategoryRow["amountKobo"]>>;
export type Cat_cashTotalKobo = Assert<Exactly<ClientCategoryRow["cashTotalKobo"], ServerCategoryRow["cashTotalKobo"]>>;
export type Cat_transferTotalKobo = Assert<Exactly<ClientCategoryRow["transferTotalKobo"], ServerCategoryRow["transferTotalKobo"]>>;
export type Cat_denominations = Assert<Exactly<ClientCategoryRow["denominations"], ServerCategoryRow["denominations"]>>;
export type Cat_bucketRatePercent = Assert<Exactly<ClientCategoryRow["bucketRatePercent"], ServerCategoryRow["bucketRatePercent"]>>;
export type Cat_bucketDeductionKobo = Assert<Exactly<ClientCategoryRow["bucketDeductionKobo"], ServerCategoryRow["bucketDeductionKobo"]>>;
export type Cat_netAmountKobo = Assert<Exactly<ClientCategoryRow["netAmountKobo"], ServerCategoryRow["netAmountKobo"]>>;
export type Cat_noExtraKeys = Assert<Exactly<keyof ClientCategoryRow, keyof ServerCategoryRow>>;
/*
  WAS FAILING ON PURPOSE. Now holds, and the assertion is unchanged.

  `Cat_id` and `Cat_optionalKeysMatch` were the only two assertions in this file
  that did not hold. The split was `id`: the client declares it required, while
  the server's inferred shape made it optional, because `CategoryTotals.id?` in
  server/src/domain/offering.ts is optional for callers that compute a preview
  with no row behind it.

  Fixed on the server, which is where the looseness was: `presentOffering` now
  sets `id: category.id` from the Prisma row after spreading the computed row,
  so the inferred type says `string`. `CategoryTotals.id` and `CategoryInput.id`
  stay optional, because the provisional-total path genuinely has no row.
  Widening the client to `id?: string` would have been the wrong fix and is
  still not what this asserts.

  The wire output is unchanged by that fix — proved separately and at runtime in
  tests/presentOfferingWire.test.ts, which checks the key order and the kobo.
*/
export type Cat_optionalKeysMatch = Assert<Exactly<
  { [K in keyof ClientCategoryRow]-?: {} extends Pick<ClientCategoryRow, K> ? K : never }[keyof ClientCategoryRow],
  { [K in keyof ServerCategoryRow]-?: {} extends Pick<ServerCategoryRow, K> ? K : never }[keyof ServerCategoryRow]
>>;

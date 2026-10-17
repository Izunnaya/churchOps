import type { ServiceKind } from "@/types";

/*
  How each service kind is written on screen. The enum values come from
  server/prisma/schema.prisma; the wording is the church's, not the database's —
  nobody reads "SUNDAY_FIRST" out loud.

  A static option list, so it lives here rather than inside a component.
*/
export const SERVICE_KIND_LABELS: Record<ServiceKind, string> = {
  SUNDAY_FIRST: "First service",
  SUNDAY_SECOND: "Second service",
  MIDWEEK: "Midweek service",
  VIGIL: "Vigil",
  CONVENTION: "Convention",
  SPECIAL: "Special service",
};

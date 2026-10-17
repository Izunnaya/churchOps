import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Navigate, useParams } from "react-router-dom";
import OfferingEntryPage from "@/pages/OfferingEntryPage";
import { offeringKeys } from "@/api/OfferingApi";
import type { Offering } from "@/types";

/*
  A look at Offering Entry with figures in it, for design review only.

  This renders the REAL page and the real components. Nothing here is a copy of
  them and nothing is mocked: the offering below is written straight into the
  query cache, so the page reads it exactly as it would read a served one. The
  cache is its own client with refetching off, so no request is attempted.

  It runs at one fixed id and refuses every other one. The real page reads its
  id with useParams, and its hooks post to whatever that id is, so a preview
  that accepted the address as given would be the invented figures below shown
  against a real offering — with a live Finalize that locks it, on a screen
  whose own banner says saving does not work. One id, seeded under that id,
  everything else redirected to it.

  What this cannot show, and is not pretending to: saving. Every mutation on the
  page still goes to the network, and the network has no router mounted, so Save
  and Finalize will fail with the error toast they are supposed to show. That is
  the honest state of the slice, not a defect in the preview.

  The figures are invented. There is no real church data anywhere in this
  repository, and this route goes when Offering History can link to a real one.
*/

const PREVIEW_OFFERING_ID = "preview-offering";

/// Invented. A plausible Sunday, as the Treasurer or Pastor would see it —
/// the bucket fields below are absent from a Secretary's response entirely.
const PREVIEW_OFFERING: Offering = {
  id: PREVIEW_OFFERING_ID,
  status: "DRAFT",
  notes: null,
  service: {
    id: "preview-service",
    name: "Sunday Worship",
    kind: "SUNDAY_FIRST",
    heldOn: "2026-10-11T08:00:00.000Z",
  },
  categories: [
    {
      id: "preview-tithe",
      name: "Tithe",
      isCash: true,
      amountKobo: 1_800_000,
      cashTotalKobo: 1_800_000,
      transferTotalKobo: 0,
      denominations: [
        { denomination: 1000, quantity: 12, lineTotalKobo: 1_200_000 },
        { denomination: 500, quantity: 8, lineTotalKobo: 400_000 },
        { denomination: 100, quantity: 20, lineTotalKobo: 200_000 },
      ],
      bucketRatePercent: "10.00",
      bucketDeductionKobo: 180_000,
      netAmountKobo: 1_620_000,
    },
    {
      id: "preview-worship",
      name: "Worship Offering",
      isCash: true,
      amountKobo: 1_050_000,
      cashTotalKobo: 1_050_000,
      transferTotalKobo: 0,
      denominations: [
        { denomination: 500, quantity: 5, lineTotalKobo: 250_000 },
        { denomination: 200, quantity: 30, lineTotalKobo: 600_000 },
        { denomination: 50, quantity: 40, lineTotalKobo: 200_000 },
      ],
      // Not every category is bucketed. This one is not, so the rate is null
      // and the strip does not appear on its card.
      bucketRatePercent: null,
      bucketDeductionKobo: 0,
      netAmountKobo: 1_050_000,
    },
    {
      id: "preview-seed-faith",
      name: "Seed Faith",
      isCash: false,
      amountKobo: 2_500_000,
      cashTotalKobo: 0,
      transferTotalKobo: 2_500_000,
      denominations: [],
      bucketRatePercent: "10.00",
      bucketDeductionKobo: 250_000,
      netAmountKobo: 2_250_000,
    },
  ],
  totals: {
    cashTotalKobo: 2_850_000,
    transferTotalKobo: 2_500_000,
    categoriesTotalKobo: 5_350_000,
    bucketTotalKobo: 430_000,
    usableIncomeKobo: 4_920_000,
  },
  revisions: [],
  originalTotalKobo: 5_350_000,
  revisedTotalKobo: 5_350_000,
  hasRevisions: false,
  recordedBy: { id: "preview-user", fullName: "The Treasurer" },
  finalizedBy: null,
  finalizedAt: null,
  approvedBy: null,
  approvedAt: null,
  comments: [],
  createdAt: "2026-10-11T09:14:00.000Z",
  updatedAt: "2026-10-11T09:41:00.000Z",
};

const PREVIEW_PATH = `/preview/offering-entry/${PREVIEW_OFFERING_ID}`;

const buildPreviewClient = () => {
  const previewClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: Infinity, refetchOnMount: false },
    },
  });

  // Seeded under the one id this page may run at, never under the address.
  previewClient.setQueryData(offeringKeys.detail(PREVIEW_OFFERING_ID), PREVIEW_OFFERING);

  return previewClient;
};

const OfferingEntryPreviewPage = () => {
  const { offeringId } = useParams<{ offeringId: string }>();

  // Built once. Rebuilding it per render would discard the seeded cache, and
  // the page would fall straight through to its error state.
  const [previewClient] = useState(buildPreviewClient);

  // Any other id would point the real page's Save, Remove and Finalize at a
  // record that is not this fixture.
  if (offeringId !== PREVIEW_OFFERING_ID) {
    return <Navigate to={PREVIEW_PATH} replace />;
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="rounded-card border border-line bg-sunken px-4 py-3 text-hint text-ink-3">
        Design preview. The figures are invented and saving does not work — no
        route is mounted on the server yet, so Save and Finalize will report a
        failure.
      </p>

      {/* Its own query client, so the seeded offering is read and nothing is fetched. */}
      <QueryClientProvider client={previewClient}>
        <OfferingEntryPage />
      </QueryClientProvider>
    </div>
  );
};

export default OfferingEntryPreviewPage;

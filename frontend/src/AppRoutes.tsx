import { Navigate, Route, Routes } from "react-router-dom";
import Layout from "@/layouts/layout";
import OfferingEntryPage from "@/pages/OfferingEntryPage";
import OfferingEntryPreviewPage from "@/pages/OfferingEntryPreviewPage";
import ThemeCheckPage from "@/pages/ThemeCheckPage";

/*
  Every route in the app, in one file.

  Offering Entry takes an offering id because an offering belongs to a service
  that already exists; nothing here creates one. Offering History (TRE-003) is
  the screen that lists them and links in, and until it exists this route is
  reachable only by typing the address. The theme check stays at the root as
  the proof the tokens load, and goes when the history screen takes its place.

  Sign-in and the protected routes arrive with slice 1.4a. No catch-all is
  declared yet: the unavailable page (state U1) is its own frame, H04, and
  inventing it here would be inventing copy for a state nobody has designed.
*/
const AppRoutes = () => {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<ThemeCheckPage />} />
        <Route path="/offerings/:offeringId" element={<OfferingEntryPage />} />
        <Route
          path="/preview/offering-entry"
          element={<Navigate to="/preview/offering-entry/preview-offering" replace />}
        />
        <Route
          path="/preview/offering-entry/:offeringId"
          element={<OfferingEntryPreviewPage />}
        />
      </Route>
    </Routes>
  );
};

export default AppRoutes;

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";
import AppRoutes from "@/AppRoutes";
import { RequestFailed, isNoConnection } from "@/lib/api-client";
import "@/index.css";

/*
  Providers only. Routes live in AppRoutes.tsx.
*/
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // The server owns every figure, so a stale total is never shown on
      // purpose: a screen that comes back into focus re-reads it.
      refetchOnWindowFocus: true,
      // A refused request is refused. Retrying a 403 or a 404 only delays the
      // state the person needs to see, and a 409 must reach the screen at once
      // so the latest version can be reviewed. Anything that is not a
      // RequestFailed is a fault in this app, not a request worth sending
      // again — reading a `status` off it would read `undefined` and treat a
      // bug as if the phone were offline.
      retry: (failureCount, error) => {
        if (failureCount >= 2) return false;
        if (isNoConnection(error)) return true;
        return error instanceof RequestFailed && error.status >= 500;
      },
    },
    mutations: {
      // Never automatic for a write. A finalize, an approval or a correction is
      // retried only when the person chooses to, after the screen has checked
      // whether the first attempt saved.
      retry: false,
    },
  },
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AppRoutes />
        <Toaster position="top-center" richColors closeButton />
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);

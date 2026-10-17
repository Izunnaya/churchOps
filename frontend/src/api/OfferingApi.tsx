/*
  Every offering endpoint the server has today. One file for the resource, one
  hook per endpoint, nothing else in the app calling it.

  None of this has been run against a live server: server/src/index.ts mounts no
  router yet, so `/health` is the only reachable route. These hooks are typed and
  structured against the code in server/src/modules/offerings/, and unverified.
*/

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  OFFERINGS_PATH,
  getDisplayMessage,
  request,
  requestWithStatus,
} from "@/lib/api-client";
import type {
  AddOfferingCategoryRequest,
  AddOfferingCommentRequest,
  CreateOfferingRequest,
  Envelope,
  Offering,
  OfferingListQuery,
  PagedEnvelope,
  Page,
  RecordRevisionRequest,
  RevisionOutcome,
  UpdateOfferingCategoryRequest,
} from "@/types";

/*
  Every id is escaped into the path. `useParams` hands back a DECODED segment,
  so an address carrying %2F arrives here as a slash and would otherwise build a
  path the browser resolves to a different endpoint — whose answer this screen
  would then show as the offering.
*/
export const offeringKeys = {
  all: ["offerings"] as const,
  lists: () => [...offeringKeys.all, "list"] as const,
  list: (query: OfferingListQuery) => [...offeringKeys.lists(), query] as const,
  detail: (offeringId: string) => [...offeringKeys.all, "detail", offeringId] as const,
};

// --- reads ---------------------------------------------------------------

export const useGetOfferings = (query: OfferingListQuery = {}) => {
  const getOfferingsRequest = async (): Promise<PagedEnvelope<Offering[]>> =>
    request<PagedEnvelope<Offering[]>>(OFFERINGS_PATH, {
      query: { status: query.status, take: query.take, skip: query.skip },
    });

  const { data, isLoading, isError, error } = useQuery({
    queryKey: offeringKeys.list(query),
    queryFn: getOfferingsRequest,
  });

  const offerings: Offering[] = data?.data ?? [];
  const page: Page | undefined = data?.page;

  return { offerings, page, isLoading, isError, error };
};

export const useGetOffering = (offeringId: string | undefined) => {
  const getOfferingRequest = async (): Promise<Offering> => {
    const envelope = await request<Envelope<Offering>>(
      `${OFFERINGS_PATH}/${encodeURIComponent(offeringId ?? "")}`,
    );
    return envelope.data;
  };

  const { data: offering, isLoading, isError, error } = useQuery({
    queryKey: offeringKeys.detail(offeringId ?? ""),
    queryFn: getOfferingRequest,
    enabled: Boolean(offeringId),
  });

  return { offering, isLoading, isError, error };
};

// --- draft ---------------------------------------------------------------

export const useCreateOffering = () => {
  const queryClient = useQueryClient();

  const createOfferingRequest = async (
    newOffering: CreateOfferingRequest,
  ): Promise<Offering> => {
    const envelope = await request<Envelope<Offering>>(OFFERINGS_PATH, {
      method: "POST",
      body: newOffering,
    });
    return envelope.data;
  };

  const { mutate: createOffering, mutateAsync: createOfferingAsync, isPending } =
    useMutation({
      mutationFn: createOfferingRequest,
      onSuccess: (offering) => {
        queryClient.setQueryData(offeringKeys.detail(offering.id), offering);
        void queryClient.invalidateQueries({ queryKey: offeringKeys.lists() });
        toast.success("Offering started");
      },
      onError: (error) =>
        toast.error(getDisplayMessage(error, "Unable to start this offering.")),
    });

  return { createOffering, createOfferingAsync, isPending };
};

/*
  Adding, editing and removing a category all return the whole offering, so each
  one refreshes the detail cache with the server's own figures. That matters:
  while counting, the device shows provisional subtotals, and these responses are
  what replaces them with the acknowledged ones.
*/
export const useAddOfferingCategory = (offeringId: string) => {
  const queryClient = useQueryClient();

  const addCategoryRequest = async (
    category: AddOfferingCategoryRequest,
  ): Promise<Offering> => {
    const envelope = await request<Envelope<Offering>>(
      `${OFFERINGS_PATH}/${encodeURIComponent(offeringId)}/categories`,
      { method: "POST", body: category },
    );
    return envelope.data;
  };

  const { mutate: addCategory, isPending } = useMutation({
    mutationFn: addCategoryRequest,
    onSuccess: (offering) => {
      queryClient.setQueryData(offeringKeys.detail(offeringId), offering);
      void queryClient.invalidateQueries({ queryKey: offeringKeys.lists() });
      toast.success("Category added");
    },
    onError: (error) => toast.error(getDisplayMessage(error, "Unable to add that category.")),
  });

  return { addCategory, isPending };
};

export const useUpdateOfferingCategory = (offeringId: string) => {
  const queryClient = useQueryClient();

  const updateCategoryRequest = async (update: {
    categoryId: string;
    changes: UpdateOfferingCategoryRequest;
  }): Promise<Offering> => {
    const envelope = await request<Envelope<Offering>>(
      `${OFFERINGS_PATH}/${encodeURIComponent(offeringId)}/categories/${encodeURIComponent(update.categoryId)}`,
      { method: "PATCH", body: update.changes },
    );
    return envelope.data;
  };

  const { mutate: updateCategory, isPending } = useMutation({
    mutationFn: updateCategoryRequest,
    onSuccess: (offering) => {
      queryClient.setQueryData(offeringKeys.detail(offeringId), offering);
      void queryClient.invalidateQueries({ queryKey: offeringKeys.lists() });
      toast.success("Saved");
    },
    onError: (error) => toast.error(getDisplayMessage(error, "Your count has not been saved.")),
  });

  return { updateCategory, isPending };
};

export const useDeleteOfferingCategory = (offeringId: string) => {
  const queryClient = useQueryClient();

  const deleteCategoryRequest = async (categoryId: string): Promise<Offering> => {
    const envelope = await request<Envelope<Offering>>(
      `${OFFERINGS_PATH}/${encodeURIComponent(offeringId)}/categories/${encodeURIComponent(categoryId)}`,
      { method: "DELETE" },
    );
    return envelope.data;
  };

  const { mutate: deleteCategory, isPending } = useMutation({
    mutationFn: deleteCategoryRequest,
    onSuccess: (offering) => {
      queryClient.setQueryData(offeringKeys.detail(offeringId), offering);
      void queryClient.invalidateQueries({ queryKey: offeringKeys.lists() });
      toast.success("Category removed");
    },
    onError: (error) =>
      toast.error(getDisplayMessage(error, "Unable to remove that category.")),
  });

  return { deleteCategory, isPending };
};

// --- state changes -------------------------------------------------------

export const useFinalizeOffering = (offeringId: string) => {
  const queryClient = useQueryClient();

  const finalizeOfferingRequest = async (): Promise<Offering> => {
    const envelope = await request<Envelope<Offering>>(
      `${OFFERINGS_PATH}/${encodeURIComponent(offeringId)}/finalize`,
      { method: "POST" },
    );
    return envelope.data;
  };

  const { mutate: finalizeOffering, isPending } = useMutation({
    mutationFn: finalizeOfferingRequest,
    onSuccess: (offering) => {
      queryClient.setQueryData(offeringKeys.detail(offeringId), offering);
      void queryClient.invalidateQueries({ queryKey: offeringKeys.lists() });
      toast.success("Offering finalized");
    },
    onError: (error) =>
      toast.error(getDisplayMessage(error, "This offering has not been finalized.")),
  });

  return { finalizeOffering, isPending };
};

export const useApproveOffering = (offeringId: string) => {
  const queryClient = useQueryClient();

  const approveOfferingRequest = async (): Promise<Offering> => {
    const envelope = await request<Envelope<Offering>>(
      `${OFFERINGS_PATH}/${encodeURIComponent(offeringId)}/approve`,
      { method: "POST" },
    );
    return envelope.data;
  };

  const { mutate: approveOffering, isPending } = useMutation({
    mutationFn: approveOfferingRequest,
    onSuccess: (offering) => {
      queryClient.setQueryData(offeringKeys.detail(offeringId), offering);
      void queryClient.invalidateQueries({ queryKey: offeringKeys.lists() });
      toast.success("Offering approved");
    },
    onError: (error) =>
      toast.error(getDisplayMessage(error, "This offering has not been approved.")),
  });

  return { approveOffering, isPending };
};

export const useAddOfferingComment = (offeringId: string) => {
  const queryClient = useQueryClient();

  const addCommentRequest = async (
    comment: AddOfferingCommentRequest,
  ): Promise<Offering> => {
    const envelope = await request<Envelope<Offering>>(
      `${OFFERINGS_PATH}/${encodeURIComponent(offeringId)}/comments`,
      { method: "POST", body: comment },
    );
    return envelope.data;
  };

  const { mutate: addComment, isPending } = useMutation({
    mutationFn: addCommentRequest,
    onSuccess: (offering) => {
      queryClient.setQueryData(offeringKeys.detail(offeringId), offering);
      toast.success("Note sent");
    },
    onError: (error) => toast.error(getDisplayMessage(error, "Your note has not been sent.")),
  });

  return { addComment, isPending };
};

/*
  A correction to a finalized or approved offering, which is never an overwrite.

  The idempotency key identifies the CORRECTION, not the attempt. It is minted
  once here and reused on every retry of the same figures, which is the only way
  a double tap or a dropped connection can resolve to the revision already
  written instead of recording a second one. A fresh key per attempt would defeat
  the mechanism entirely, so callers cannot supply one — they pass the figures
  and call `startNewCorrection` when they begin a genuinely different one.
*/
export type RevisionDraft = Omit<RecordRevisionRequest, "idempotencyKey">;

export const useRecordRevision = (offeringId: string) => {
  const queryClient = useQueryClient();
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());

  const recordRevisionRequest = async (
    draft: RevisionDraft,
  ): Promise<RevisionOutcome> => {
    const answered = await requestWithStatus<Envelope<Offering>>(
      `${OFFERINGS_PATH}/${encodeURIComponent(offeringId)}/revisions`,
      { method: "POST", body: { ...draft, idempotencyKey } },
    );

    // 201 recorded a revision. 200 means this key had already recorded one and
    // this request added nothing — the body is identical, so the status is the
    // only thing that tells them apart.
    return { offering: answered.data.data, created: answered.status === 201 };
  };

  const { mutate: recordRevision, isPending } = useMutation({
    mutationFn: recordRevisionRequest,
    onSuccess: ({ offering, created }) => {
      queryClient.setQueryData(offeringKeys.detail(offeringId), offering);
      void queryClient.invalidateQueries({ queryKey: offeringKeys.lists() });

      // A replay must not claim a new correction was saved.
      toast.success(
        created
          ? "Correction recorded"
          : "This correction was already recorded. Nothing was added.",
      );
    },
    onError: (error) =>
      toast.error(getDisplayMessage(error, "Your correction has not been saved.")),
  });

  /// Call when the treasurer starts a different correction. A new key belongs to
  /// a new correction, never to a retry of this one.
  const startNewCorrection = () => setIdempotencyKey(crypto.randomUUID());

  return { recordRevision, isPending, startNewCorrection };
};

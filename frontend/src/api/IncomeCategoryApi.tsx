/*
  The treasurer-maintained income category list, which is also the bucket rate
  table — one list on purpose, so a rate can never drift out of step with the
  name it applies to.

  Unverified against a live server: no router is mounted in server/src/index.ts
  yet. Typed against server/src/modules/offerings/incomeCategories.router.ts.
*/

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { INCOME_CATEGORIES_PATH, getDisplayMessage, request } from "@/lib/api-client";
import { offeringKeys } from "@/api/OfferingApi";
import type {
  CreateIncomeCategoryRequest,
  Envelope,
  IncomeCategory,
  UpdateIncomeCategoryRequest,
} from "@/types";

/*
  Ids are escaped into the path, for the reason recorded in OfferingApi: a
  decoded route segment must not be able to redirect the request.
*/
export const incomeCategoryKeys = {
  all: ["income-categories"] as const,
  list: () => [...incomeCategoryKeys.all, "list"] as const,
};

export const useGetIncomeCategories = () => {
  const getIncomeCategoriesRequest = async (): Promise<IncomeCategory[]> => {
    const envelope = await request<Envelope<IncomeCategory[]>>(INCOME_CATEGORIES_PATH);
    return envelope.data;
  };

  const { data, isLoading, isError, error } = useQuery({
    queryKey: incomeCategoryKeys.list(),
    queryFn: getIncomeCategoriesRequest,
  });

  const incomeCategories: IncomeCategory[] = data ?? [];

  return { incomeCategories, isLoading, isError, error };
};

/*
  A rate change moves the deduction on every offering still being counted, and
  on none that are finalized — the server freezes each category's rate when the
  offering is finalized. So every write here also refreshes the offerings in
  view, because a draft on screen is now showing a stale set-aside.
*/
const useInvalidateCategoriesAndDrafts = () => {
  const queryClient = useQueryClient();

  return () => {
    void queryClient.invalidateQueries({ queryKey: incomeCategoryKeys.all });
    void queryClient.invalidateQueries({ queryKey: offeringKeys.all });
  };
};

export const useCreateIncomeCategory = () => {
  const invalidate = useInvalidateCategoriesAndDrafts();

  const createIncomeCategoryRequest = async (
    newCategory: CreateIncomeCategoryRequest,
  ): Promise<IncomeCategory> => {
    const envelope = await request<Envelope<IncomeCategory>>(INCOME_CATEGORIES_PATH, {
      method: "POST",
      body: newCategory,
    });
    return envelope.data;
  };

  const { mutate: createIncomeCategory, isPending } = useMutation({
    mutationFn: createIncomeCategoryRequest,
    onSuccess: (category) => {
      invalidate();
      toast.success(`${category.name} added`);
    },
    onError: (error) => toast.error(getDisplayMessage(error, "Unable to add that category.")),
  });

  return { createIncomeCategory, isPending };
};

export const useUpdateIncomeCategory = () => {
  const invalidate = useInvalidateCategoriesAndDrafts();

  const updateIncomeCategoryRequest = async (update: {
    incomeCategoryId: string;
    changes: UpdateIncomeCategoryRequest;
  }): Promise<IncomeCategory> => {
    const envelope = await request<Envelope<IncomeCategory>>(
      `${INCOME_CATEGORIES_PATH}/${encodeURIComponent(update.incomeCategoryId)}`,
      { method: "PATCH", body: update.changes },
    );
    return envelope.data;
  };

  const { mutate: updateIncomeCategory, isPending } = useMutation({
    mutationFn: updateIncomeCategoryRequest,
    onSuccess: () => {
      invalidate();
      toast.success("Saved");
    },
    onError: (error) => toast.error(getDisplayMessage(error, "Your change has not been saved.")),
  });

  return { updateIncomeCategory, isPending };
};

/*
  The server retires a category rather than deleting it, because past offerings
  name it and the rate that applied then still has to be explicable. The copy
  says retired, not deleted, so it matches what happened.
*/
export const useRetireIncomeCategory = () => {
  const invalidate = useInvalidateCategoriesAndDrafts();

  const retireIncomeCategoryRequest = async (
    incomeCategoryId: string,
  ): Promise<IncomeCategory> => {
    const envelope = await request<Envelope<IncomeCategory>>(
      `${INCOME_CATEGORIES_PATH}/${encodeURIComponent(incomeCategoryId)}`,
      { method: "DELETE" },
    );
    return envelope.data;
  };

  const { mutate: retireIncomeCategory, isPending } = useMutation({
    mutationFn: retireIncomeCategoryRequest,
    onSuccess: (category) => {
      invalidate();
      toast.success(`${category.name} is no longer offered on new offerings`);
    },
    onError: (error) =>
      toast.error(getDisplayMessage(error, "Unable to retire that category.")),
  });

  return { retireIncomeCategory, isPending };
};

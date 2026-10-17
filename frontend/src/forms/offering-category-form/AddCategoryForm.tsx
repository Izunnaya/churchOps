import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Plus } from "lucide-react";
import { NAIRA_AMOUNT } from "@/lib/money";
import type { AddOfferingCategoryRequest } from "@/types";

/*
  Adding a category is the first step of the category-first flow: a name, and
  how the money arrived. A cash category starts empty and is counted note by
  note on its card; a transfer carries only its amount, because there is no
  physical cash to break down.

  The form owns its schema and its submit, and calls `onSave`. It never calls an
  API hook — the page does that, so the same form can be reused by a screen that
  saves somewhere else without carrying a request with it.
*/

/*
  `transferAmount` is validated only on a transfer, and is never sent on a cash
  category — the server rejects it there, and the card's note counts are the
  only source for a cash total.
*/
const addCategorySchema = z
  .object({
    name: z.string().trim().min(1, "Give the category a name"),
    kind: z.enum(["cash", "transfer"]),
    transferAmount: z.string().trim().optional(),
  })
  .refine(
    (fields) =>
      fields.kind === "cash" ||
      (fields.transferAmount !== undefined && NAIRA_AMOUNT.test(fields.transferAmount)),
    {
      message: "Enter the amount received, like 3500 or 3500.00",
      path: ["transferAmount"],
    },
  );

type AddCategoryFields = z.infer<typeof addCategorySchema>;

type Props = {
  onSave: (category: AddOfferingCategoryRequest) => void;
  isSaving: boolean;
};

const AddCategoryForm = ({ onSave, isSaving }: Props) => {
  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<AddCategoryFields>({
    resolver: zodResolver(addCategorySchema),
    defaultValues: { name: "", kind: "cash", transferAmount: "" },
  });

  /// `useWatch` rather than `watch`: the latter hands back a function that
  /// cannot be memoized, which the React Compiler flags and which would make
  /// the amount field's appearance depend on a stale render.
  const kind = useWatch({ control, name: "kind" });

  const onSubmit = (fields: AddCategoryFields) => {
    onSave(
      fields.kind === "cash"
        ? { name: fields.name, isCash: true }
        : { name: fields.name, isCash: false, transferAmount: fields.transferAmount },
    );
  };

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="rounded-card border border-line bg-surface p-4"
    >
      <h2 className="text-section-label uppercase text-ink-4">Add a category</h2>

      <label className="mt-3 block">
        <span className="text-secondary text-ink-2">Name</span>
        <input
          type="text"
          autoComplete="off"
          placeholder="Tithe"
          {...register("name")}
          className="mt-1 h-field w-full rounded-card border-control border-line-3 bg-surface px-3 text-ink"
        />
        {errors.name && (
          <span className="mt-1 block text-hint text-accent-red">{errors.name.message}</span>
        )}
      </label>

      <fieldset className="mt-3">
        <legend className="text-secondary text-ink-2">How did it arrive?</legend>
        <div className="mt-1 flex flex-wrap gap-2">
          {/*
            48px, not the deck's 44px pill: these are the control that decides
            whether a category is counted or typed, not a filter chip, and
            CONVENTIONS holds 48px as the floor for anything tapped.
          */}
          <label className="flex min-h-touch cursor-pointer items-center gap-2 rounded-pill border-control border-line-3 bg-surface px-4 has-checked:border-accent-blue has-checked:bg-tint-blue">
            <input type="radio" value="cash" {...register("kind")} className="size-4" />
            <span className="text-body text-ink-2">Counted in cash</span>
          </label>

          <label className="flex min-h-touch cursor-pointer items-center gap-2 rounded-pill border-control border-line-3 bg-surface px-4 has-checked:border-accent-blue has-checked:bg-tint-blue">
            <input type="radio" value="transfer" {...register("kind")} className="size-4" />
            <span className="text-body text-ink-2">Transfer</span>
          </label>
        </div>
      </fieldset>

      {kind === "transfer" && (
        <label className="mt-3 block">
          <span className="text-secondary text-ink-2">Amount received</span>
          <input
            type="text"
            inputMode="decimal"
            placeholder="3500"
            {...register("transferAmount")}
            className="mt-1 h-field w-full rounded-card border-control border-line-3 bg-surface px-3 money text-large-input text-ink"
          />
          {errors.transferAmount && (
            <span className="mt-1 block text-hint text-accent-red">
              {errors.transferAmount.message}
            </span>
          )}
        </label>
      )}

      <button
        type="submit"
        disabled={isSaving}
        className="mt-4 flex h-control w-full items-center justify-center gap-2 rounded-card bg-accent-blue px-5 text-button text-surface disabled:bg-line-4 disabled:text-ink-4"
      >
        <Plus aria-hidden="true" className="size-4" />
        {isSaving ? "Adding…" : "Add category"}
      </button>
    </form>
  );
};

export default AddCategoryForm;

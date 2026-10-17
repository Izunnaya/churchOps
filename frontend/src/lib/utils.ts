import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/// shadcn's class merger. The only thing this file is for.
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

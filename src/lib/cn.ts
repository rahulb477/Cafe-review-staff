import { twMerge } from "tailwind-merge";

export type ClassValue = string | number | false | null | undefined;

/**
 * Joins class names and resolves Tailwind conflicts so the LAST value wins.
 *
 * This matters for the shared components: `<Card className="p-3.5">` must beat
 * the Card's own default `p-4` regardless of the order Tailwind emits those
 * rules in the stylesheet. Without merging, cascade order (not author intent)
 * decides, which silently breaks the spacing rhythm of the design system.
 */
export function cn(...values: ClassValue[]): string {
  return twMerge(values.filter(Boolean).join(" "));
}

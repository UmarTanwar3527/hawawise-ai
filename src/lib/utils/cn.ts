export type ClassValue = string | false | null | undefined;

/**
 * Joins conditional class names. It does not resolve conflicting Tailwind
 * utilities, so components should design `className` overrides to be additive.
 */
export function cn(...classes: ClassValue[]): string {
  return classes.filter(Boolean).join(" ");
}

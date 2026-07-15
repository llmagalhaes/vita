/**
 * Plan-digest notification body (CEO #7). A digest habit fires a local notification
 * that reads back the linked plan meal's macros and a few example foods — purely
 * informative, never a goal/score/advice (philosophy). Pure + tested; the notifier
 * calls this to build the notification content.
 */
import type { EatingPlanDraft } from "../api/client";
import { mealTotals } from "../plan/compute";

/**
 * "{Meal}, from your plan · 24 g protein · 39 g carbs · 20 g fat · e.g. Oats, Banana, Milk".
 * Returns null when the meal isn't found (habit's plan meal was removed/renamed) —
 * the caller falls back to a neutral body then.
 */
export function planDigestBody(plan: EatingPlanDraft | null, mealName: string | undefined): string | null {
  if (!plan || !mealName) return null;
  const meal = plan.meals.find((m) => m.name === mealName);
  if (!meal) return null;
  const tot = mealTotals(meal);
  const macros = `${Math.round(tot.proteinG)} g protein · ${Math.round(tot.carbsG)} g carbs · ${Math.round(tot.fatG)} g fat`;
  const foods = meal.items
    .map((i) => i.name)
    .filter(Boolean)
    .slice(0, 3)
    .join(", ");
  const head = `${meal.name}, from your plan · ${macros}`;
  return foods ? `${head} · e.g. ${foods}` : head;
}

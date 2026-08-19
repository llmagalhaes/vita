package com.llmagal.vita.service.ai

import com.llmagal.vita.model.ai.EatingPlanDraft
import com.llmagal.vita.model.ai.MealOption
import com.llmagal.vita.model.ai.PlanItem
import com.llmagal.vita.model.ai.PlanMeal
import kotlin.math.floor

/**
 * Compact plain-text digest of the user's current eating plan, injected into the capture
 * prompt (BE-051, backend-plan §3.6): meal `{id, name, time}` → items
 * `{id, name, quantity, unit, kcalPerUnit}`, plus each meal option so the model can report
 * `planOptionIndex`.
 *
 * SWAP LISTS ARE DELIBERATELY EXCLUDED — up to 26 per item × 42 items would dominate the
 * context for no gain: the model names the replacement food and the app matches it against
 * the swap list it already holds.
 *
 * Only id-carrying meals/items are listed: the id is what a draft points back at, and ids are
 * stamped at save time with no backfill (CEO A2), so a plan saved before BE-050 yields no
 * digest at all and capture behaves exactly as in 0.7.0.
 */
object PlanDigest {
    /** Null when the plan has nothing addressable — the caller then sends the 0.7.0 prompt verbatim. */
    fun of(plan: EatingPlanDraft): String? =
        plan.meals
            .flatMap(::mealLines)
            .joinToString("\n")
            .ifBlank { null }

    private fun mealLines(meal: PlanMeal): List<String> {
        val id = meal.id ?: return emptyList()
        val head = listOfNotNull(id, meal.name, meal.time).joinToString(" | ")
        return listOf(head) +
            meal.items.mapNotNull { itemLine(it, "  ") } +
            meal.options.orEmpty().flatMapIndexed(::optionLines)
    }

    private fun optionLines(
        index: Int,
        option: MealOption,
    ): List<String> = listOf("  option $index | ${option.name}") + option.items.mapNotNull { itemLine(it, "    ") }

    private fun itemLine(
        item: PlanItem,
        indent: String,
    ): String? {
        val id = item.id ?: return null
        val amount = listOfNotNull(item.quantity?.let(::plain), item.unit).joinToString(" ").ifBlank { null }
        val kcal = item.nutritionPerUnit?.kcal?.let { "${plain(it)} kcal/unit" }
        return indent + listOfNotNull(id, item.name, amount, kcal).joinToString(" | ")
    }

    /** 2.0 → "2", 1.5 → "1.5": no trailing ".0" noise in the prompt. */
    private fun plain(v: Double): String = if (v.isFinite() && v == floor(v)) v.toLong().toString() else v.toString()
}

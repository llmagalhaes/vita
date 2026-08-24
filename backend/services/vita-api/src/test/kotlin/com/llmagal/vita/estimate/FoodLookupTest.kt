package com.llmagal.vita.estimate

import com.llmagal.vita.TestcontainersConfig
import com.llmagal.vita.service.estimate.FoodLookup
import com.llmagal.vita.service.estimate.NameNorm
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.context.annotation.Import
import org.springframework.jdbc.core.JdbcTemplate

/**
 * BE-060 acceptance. Everything here runs against the real V013 seed in a Testcontainers
 * Postgres — no network, no Claude: this is the leg that must answer for free.
 */
@SpringBootTest
@Import(TestcontainersConfig::class)
class FoodLookupTest {
    @Autowired
    lateinit var lookup: FoodLookup

    @Autowired
    lateinit var jdbc: JdbcTemplate

    @Test
    fun `exact name_norm hits the seeded row`() {
        assertThat(lookup.find("Arroz, tipo 1, cozido")?.namePt).isEqualTo("Arroz, tipo 1, cozido")
    }

    @Test
    fun `case accents and punctuation all collapse onto one row`() {
        val hits = listOf("Pão Francês", "pao frances", "PÃO FRANCES", "  pao   frances  ").map { lookup.find(it) }
        assertThat(hits.map { it?.namePt }).containsOnly("Pão, trigo, francês")
    }

    @Test
    fun `a name the seed does not carry verbatim resolves by trigram`() {
        // "arroz branco cozido" is nobody's row name; .48 similarity clears the .45 floor,
        // and the tie against "Arroz, tipo 2, cozido" is broken deterministically.
        assertThat(lookup.find("arroz branco cozido")?.namePt).isEqualTo("Arroz, tipo 1, cozido")
    }

    @Test
    fun `a name nothing matches is a miss, never a forced match`() {
        assertThat(lookup.find("xyzzy")).isNull()
        assertThat(lookup.kcal("xyzzy", 100.0, "g")).isNull()
    }

    @Test
    fun `an alias rescues a bare word that falls under the trigram floor`() {
        // "aveia" alone scores .33 against "Aveia, flocos, crua" — the curated alias is the
        // sanctioned lever, never a lower threshold.
        assertThat(lookup.find("aveia")?.namePt).isEqualTo("Aveia, flocos, crua")
    }

    @Test
    fun `Aveia 60 g is 235`() {
        assertThat(lookup.kcal("Aveia", 60.0, "g")).isEqualTo(235)
    }

    @Test
    fun `a countable unit resolves only through grams_per_unit`() {
        assertThat(lookup.kcal("pao frances", 1.0, "unit")).isEqualTo(150)
        assertThat(lookup.kcal("pao frances", 2.0, "unit")).isEqualTo(300)
    }

    @Test
    fun `a countable unit without grams_per_unit misses`() {
        assertThat(lookup.find("Arroz, tipo 1, cozido")?.gramsPerUnit).isNull()
        assertThat(lookup.kcal("Arroz, tipo 1, cozido", 1.0, "unit")).isNull()
        assertThat(lookup.kcal("Arroz, tipo 1, cozido", 1.0, "serving")).isNull()
    }

    @Test
    fun `ml is treated as g and an unconvertible unit misses`() {
        assertThat(lookup.kcal("Café, infusão 10%", 200.0, "ml")).isEqualTo(20)
        assertThat(lookup.kcal("Café, infusão 10%", 1.0, "colher")).isNull()
    }

    @Test
    fun `every answer is a multiple of 5 with a floor of 5`() {
        assertThat(lookup.kcal("Alface, crespa, crua", 1.0, "g")).isEqualTo(5) // 0.1 kcal -> the floor
        assertThat(FoodLookup.round5(0.0)).isEqualTo(5)
        assertThat(FoodLookup.round5(237.4)).isEqualTo(235)
        assertThat(listOf(1.0, 7.0, 233.4, 999.9).map { FoodLookup.round5(it) % 5 }).containsOnly(0)
    }

    @Test
    fun `a non-positive quantity is a miss`() {
        assertThat(lookup.kcal("Aveia", 0.0, "g")).isNull()
        assertThat(lookup.kcal("Aveia", -60.0, "g")).isNull()
    }

    @Test
    fun `normalization drops one leading quantity but never a word that names the thing`() {
        assertThat(NameNorm.of("500 ml de Café")).isEqualTo("cafe")
        assertThat(NameNorm.of("2 Ovos")).isEqualTo("ovos")
        // The rule that used to collapse these two onto one key:
        assertThat(NameNorm.of("One-Arm Kettlebell Row")).isNotEqualTo(NameNorm.of("Two-Arm Kettlebell Row"))
        assertThat(NameNorm.of("3/4 Sit-Up")).isNotEqualTo(NameNorm.of("Sit-Up"))
        assertThat(NameNorm.of("100")).isEqualTo("100") // never normalizes to nothing
    }

    @Test
    fun `the V013 seed is what the migration claims and every key round-trips`() {
        assertThat(jdbc.queryForObject("SELECT count(*) FROM food", Int::class.java)).isEqualTo(SEED_ROWS)
        assertThat(jdbc.queryForObject("SELECT count(*) FROM food_alias", Int::class.java)).isEqualTo(SEED_ALIASES)

        // The generator's Python normalizer and NameNorm.kt must agree on every single row,
        // or a lookup silently stops finding things. This is the guard instead of a second
        // implementation in SQL.
        val drift =
            jdbc
                .queryForList("SELECT name_norm, name_pt FROM food")
                .filter { NameNorm.of(it["name_pt"] as String) != it["name_norm"] }
        assertThat(drift).isEmpty()

        val aliasDrift =
            jdbc
                .queryForList("SELECT name_norm FROM food_alias", String::class.java)
                .filter { NameNorm.of(it) != it }
        assertThat(aliasDrift).isEmpty()
    }

    private companion object {
        const val SEED_ROWS = 590
        const val SEED_ALIASES = 66
    }
}

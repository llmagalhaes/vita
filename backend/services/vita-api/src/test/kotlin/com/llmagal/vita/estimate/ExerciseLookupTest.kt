package com.llmagal.vita.estimate

import com.llmagal.vita.TestcontainersConfig
import com.llmagal.vita.model.Muscles
import com.llmagal.vita.service.estimate.ExerciseLookup
import com.llmagal.vita.service.estimate.NameNorm
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.context.annotation.Import
import org.springframework.jdbc.core.JdbcTemplate

/** BE-062 acceptance, against the real V014 seed. No network. */
@SpringBootTest
@Import(TestcontainersConfig::class)
class ExerciseLookupTest {
    @Autowired
    lateinit var lookup: ExerciseLookup

    @Autowired
    lateinit var jdbc: JdbcTemplate

    @Test
    fun `squat comes from EXCAT, not from the public DB`() {
        val hit = lookup.find("squat")!!
        assertThat(hit.name).isEqualTo("Squat")
        assertThat(hit.family).isEqualTo("set")
        assertThat(hit.wholeBody).isFalse()
        // EXCAT {qu:1, gl:.85, co:.3} at the CEO's .7 cut.
        assertThat(hit.muscleRoles.map { it.name to it.role })
            .containsExactlyInAnyOrder("quads" to "primary", "glutes" to "primary", "core" to "secondary")
        assertThat(jdbc.queryForObject("SELECT source FROM exercise WHERE name_norm = 'squat'", String::class.java))
            .isEqualTo("excat")
    }

    @Test
    fun `the arms key lights both biceps and triceps`() {
        // EXCAT "Biceps curl" is {ar: 1} — the app's one key, two silhouettes.
        assertThat(lookup.find("Biceps curl")!!.muscleRoles.map { it.name })
            .containsExactlyInAnyOrder("biceps", "triceps")
    }

    @Test
    fun `bulgarian split squat resolves from the public DB`() {
        // free-exercise-db has no Bulgarian row at all and the nearest, "Split Squats",
        // scores .435 — under the floor ADR-0020 forbids lowering. A curated alias, the
        // sanctioned lever, closes it.
        val hit = lookup.find("Bulgarian split squat")!!
        assertThat(hit.name).isEqualTo("Split Squats")
        assertThat(hit.muscleRoles.map { it.name }).contains("quads", "glutes", "hamstrings")
    }

    @Test
    fun `a Portuguese name resolves through the alias list`() {
        // Both seeds are entirely English; without aliases every PT name the CEO types misses.
        assertThat(lookup.find("agachamento")?.name).isEqualTo("Squat")
        assertThat(lookup.find("Corrida")?.name).isEqualTo("Running")
        assertThat(lookup.find("supino")?.name).isEqualTo("Bench press")
    }

    @Test
    fun `a long public-DB name resolves by trigram`() {
        assertThat(lookup.find("barbell bench press")?.name).contains("Bench Press")
    }

    @Test
    fun `traps is a real muscle in the seed`() {
        assertThat(jdbc.queryForObject("SELECT count(*) FROM exercise_muscle WHERE muscle = 'traps'", Int::class.java))
            .isGreaterThan(0)
        // EXCAT "Face pull" {sh:.7, tr:.8, bk:.5} — the chip that could never light before 0.9.0.
        assertThat(lookup.find("Face pull")!!.muscleRoles.map { it.name to it.role })
            .containsExactlyInAnyOrder("traps" to "primary", "shoulders" to "primary", "back" to "secondary")
    }

    @Test
    fun `whole_body and family come from EXCAT`() {
        assertThat(lookup.find("Running")!!.wholeBody).isTrue()
        assertThat(lookup.find("Running")!!.family).isEqualTo("time")
        assertThat(lookup.find("Plank")!!.wholeBody).isFalse() // the only timed EXCAT entry that is not
        assertThat(lookup.find("Muay thai")!!.family).isEqualTo("time")
    }

    @Test
    fun `an unknown name is a miss`() {
        assertThat(lookup.find("Pole dance")).isNull()
        assertThat(lookup.find("qwertyuiop")).isNull()
    }

    @Test
    fun `every seeded muscle is in the contract vocabulary`() {
        val seeded = jdbc.queryForList("SELECT DISTINCT muscle FROM exercise_muscle", String::class.java)
        assertThat(seeded).isSubsetOf(Muscles.VOCAB)
        assertThat(seeded).contains("traps")
    }

    @Test
    fun `the V014 seed is what the migration claims and every key round-trips`() {
        assertThat(jdbc.queryForObject("SELECT count(*) FROM exercise", Int::class.java)).isEqualTo(SEED_ROWS)
        assertThat(jdbc.queryForObject("SELECT count(*) FROM exercise WHERE source = 'excat'", Int::class.java))
            .isEqualTo(EXCAT_ROWS)
        assertThat(jdbc.queryForObject("SELECT count(*) FROM exercise_alias", Int::class.java)).isEqualTo(SEED_ALIASES)

        val drift =
            jdbc
                .queryForList("SELECT name_norm, name FROM exercise")
                .filter { NameNorm.of(it["name"] as String) != it["name_norm"] }
        assertThat(drift).isEmpty()
    }

    private companion object {
        const val SEED_ROWS = 915
        const val EXCAT_ROWS = 46
        const val SEED_ALIASES = 53
    }
}

#!/usr/bin/env python3
"""One-off dev script (BE-060 / BE-062) — NOT runtime code, never on the classpath.

Downloads the two public reference datasets and writes the two Flyway migrations
whose rows ARE the seed:

  V013__food_tables.sql      TACO 4a edicao (~597 PT-BR foods)  + our alias list
  V014__exercise_tables.sql  EXCAT (47, ours) + free-exercise-db (~873, public domain)

Run from anywhere:  python3 backend/tools/gen_seed_migrations.py
Needs network (raw.githubusercontent.com). Deterministic: same inputs -> same SQL,
so re-running it produces no diff and Flyway checksums stay stable.

The normalization here MUST match FoodLookup/ExerciseLookup's Kotlin `NameNorm`.
`SeedNormalizationTest` asserts that over every seeded row, so drift fails the build.
"""

import hashlib
import json
import re
import unicodedata
import urllib.request
import uuid
from pathlib import Path

OUT = Path(__file__).resolve().parents[1] / "services/vita-api/src/main/resources/db/migration"

TACO_URL = "https://raw.githubusercontent.com/marcelosanto/tabela_taco/main/TACO.json"
FEDB_URL = "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/dist/exercises.json"

# ---------------------------------------------------------------- normalization
# Mirror of NameNorm.kt. Keep the two in lockstep (SeedNormalizationTest guards it).
NUMBER = re.compile(r"\d+([.,]\d+)?")
UNIT_WORDS = {
    "g", "gr", "grama", "gramas", "kg", "ml", "l", "litro", "litros",
    "un", "unidade", "unidades", "fatia", "fatias", "colher", "colheres",
    "xicara", "xicaras", "copo", "copos",
}
FILLER = {"de", "do", "da", "of"}


def normalize(raw: str) -> str:
    """lowercase -> strip accents -> drop punctuation -> collapse -> drop ONE leading
    quantity ("500 ml de arroz" -> "arroz").

    Only a DIGIT token counts as a quantity. Word-numbers are deliberately not stripped:
    "One-Arm Kettlebell Row" and "Two-Arm Kettlebell Row" are different exercises and
    stripping "one"/"two" collapsed them onto the same key. Stripping is done once, not
    in a loop, for the same reason ("3/4 Sit-Up" must not become "Sit-Up").
    """
    s = unicodedata.normalize("NFD", raw.lower())
    s = "".join(c for c in s if not unicodedata.combining(c))
    s = re.sub(r"[^a-z0-9]+", " ", s).strip()
    out = s.split()
    if len(out) > 1 and NUMBER.fullmatch(out[0]):
        out.pop(0)
        if len(out) > 1 and out[0] in UNIT_WORDS:
            out.pop(0)
        if len(out) > 1 and out[0] in FILLER:
            out.pop(0)
    return " ".join(out)


def det_uuid(kind: str, key: str) -> str:
    """Stable id from the provenance key, so re-running changes nothing."""
    return str(uuid.UUID(hashlib.sha256(f"vita:{kind}:{key}".encode()).hexdigest()[:32]))


def q(s: str) -> str:
    return "'" + s.replace("'", "''") + "'"


def fetch(url: str) -> list:
    with urllib.request.urlopen(url) as r:
        return json.loads(r.read().decode("utf-8"))


# --------------------------------------------------------------------- FOOD
# Hand-seeded grams for the countables that matter (BE-060). Keyed by TACO
# `description`; anything not listed misses on a `unit`/`serving` lookup, which is
# the point: "1 unidade" of bread and of watermelon must not share a number.
GRAMS_PER_UNIT = {
    "Ovo, de galinha, inteiro, cozido/10minutos": 50,
    "Ovo, de galinha, inteiro, cru": 50,
    "Ovo, de galinha, inteiro, frito": 50,
    "Ovo, de galinha, clara, cozida/10minutos": 33,
    "Ovo, de galinha, gema, cozida/10minutos": 17,
    "Ovo, de codorna, inteiro, cru": 10,
    "Pão, trigo, francês": 50,
    "Torrada, pão francês": 25,
    "Pão, trigo, forma, integral": 25,
    "Pão, trigo, sovado": 30,
    "Pão, aveia, forma": 25,
    "Pão, milho, forma": 25,
    "Pão, glúten, forma": 25,
    "Pão, de queijo, assado": 30,
    "Banana, prata, crua": 90,
    "Banana, nanica, crua": 100,
    "Banana, maçã, crua": 70,
    "Banana, ouro, crua": 40,
    "Banana, da terra, crua": 120,
    "Maçã, Fuji, com casca, crua": 130,
    "Laranja, pêra, crua": 130,
    "Tangerina, Poncã, crua": 110,
    "Mamão, Formosa, cru": 160,
    "Tapioca, com manteiga": 100,
    "Cuscuz, de milho, cozido com sal": 120,
    "Biscoito, doce, maisena": 8,
    "Biscoito, salgado, cream cracker": 7,
}

# Our own alias list — the free lever when a bare word falls under the trigram
# floor ("aveia" scores .33 against "Aveia, flocos, crua"). PT first, a few EN.
# Value = the TACO `description` it resolves to; the script fails if it does not exist.
ALIASES = {
    "arroz": "Arroz, tipo 1, cozido",
    "arroz branco": "Arroz, tipo 1, cozido",
    "arroz integral": "Arroz, integral, cozido",
    "rice": "Arroz, tipo 1, cozido",
    "feijao": "Feijão, carioca, cozido",
    "feijao preto": "Feijão, preto, cozido",
    "beans": "Feijão, carioca, cozido",
    "aveia": "Aveia, flocos, crua",
    "oats": "Aveia, flocos, crua",
    "banana": "Banana, prata, crua",
    "maca": "Maçã, Fuji, com casca, crua",
    "apple": "Maçã, Fuji, com casca, crua",
    "laranja": "Laranja, pêra, crua",
    "orange": "Laranja, pêra, crua",
    "mamao": "Mamão, Formosa, cru",
    "melancia": "Melancia, crua",
    "manga": "Manga, Palmer, crua",
    "abacate": "Abacate, cru",
    "morango": "Morango, cru",
    "uva": "Uva, Itália, crua",
    "ovo": "Ovo, de galinha, inteiro, cozido/10minutos",
    "ovo cozido": "Ovo, de galinha, inteiro, cozido/10minutos",
    "ovo frito": "Ovo, de galinha, inteiro, frito",
    "egg": "Ovo, de galinha, inteiro, cozido/10minutos",
    "clara de ovo": "Ovo, de galinha, clara, cozida/10minutos",
    "gema de ovo": "Ovo, de galinha, gema, cozida/10minutos",
    "pao": "Pão, trigo, francês",
    "pao frances": "Pão, trigo, francês",
    "pao integral": "Pão, trigo, forma, integral",
    "bread": "Pão, trigo, francês",
    "frango": "Frango, peito, sem pele, grelhado",
    "peito de frango": "Frango, peito, sem pele, grelhado",
    "chicken": "Frango, peito, sem pele, grelhado",
    "carne": "Carne, bovina, acém, moído, cozido",
    "carne moida": "Carne, bovina, acém, moído, cozido",
    "patinho": "Carne, bovina, patinho, sem gordura, grelhado",
    "beef": "Carne, bovina, acém, moído, cozido",
    # No "leite" alias: this TACO edition publishes no energy value for whole/skimmed
    # UHT milk (the cells are "*"), and pointing milk at the POWDER row would be a wrong
    # answer the table would never re-ask. It misses to the model instead, once.
    "iogurte": "Iogurte, natural",
    "yogurt": "Iogurte, natural",
    "queijo": "Queijo, minas, frescal",
    "queijo minas": "Queijo, minas, frescal",
    "cheese": "Queijo, minas, frescal",
    "batata": "Batata, inglesa, cozida",
    "batata doce": "Batata, doce, cozida",
    "macarrao": "Macarrão, trigo, cru",
    "pasta": "Macarrão, trigo, cru",
    "salada": "Alface, crespa, crua",
    "alface": "Alface, crespa, crua",
    "tomate": "Tomate, com semente, cru",
    "cenoura": "Cenoura, crua",
    "brocolis": "Brócolis, cozido",
    "azeite": "Azeite, de oliva, extra virgem",
    "azeite de oliva": "Azeite, de oliva, extra virgem",
    "manteiga": "Manteiga, com sal",
    "acucar": "Açúcar, refinado",
    "cafe": "Café, infusão 10%",
    "coffee": "Café, infusão 10%",
    "suco de laranja": "Laranja, pêra, suco",
    "tapioca": "Tapioca, com manteiga",
    "cuscuz": "Cuscuz, de milho, cozido com sal",
    "acai": "Açaí, polpa, congelada",
    "castanha do para": "Castanha-do-Brasil, crua",
    "amendoim": "Amendoim, torrado, salgado",
    "atum": "Atum, fresco, cru",
    "salmao": "Salmão, sem pele, fresco, grelhado",
    "sardinha": "Sardinha, assada",
}


def food_sql() -> str:
    rows = fetch(TACO_URL)
    by_desc = {r["description"]: r for r in rows}

    def num(v):
        # TACO marks unmeasured cells "NA" / "Tr" (traces) / "*" / "". All -> NULL.
        # Carbohydrate is computed by difference, so a handful of rows land at -0.03 after
        # rounding. A negative gram value is meaningless; clamp to 0 (the CHECK would reject it).
        try:
            return max(0.0, round(float(v), 2))
        except (TypeError, ValueError):
            return None

    seen, foods = set(), []
    for r in rows:
        desc = r["description"].strip()
        nn = normalize(desc)
        kcal = num(r.get("energy_kcal"))
        if kcal is None or nn in seen:
            print(f"  skip {desc!r} (dup or no kcal)")
            continue
        seen.add(nn)
        foods.append(
            (
                det_uuid("food", f"taco4:{r['id']}"),
                nn,
                desc,
                kcal,
                num(r.get("protein_g")),
                num(r.get("carbohydrate_g")),
                num(r.get("lipid_g")),
                GRAMS_PER_UNIT.get(desc),
                "taco-4",
                f"taco4:{r['id']}",
            )
        )

    missing = [d for d in list(GRAMS_PER_UNIT) + list(ALIASES.values()) if d not in by_desc]
    if missing:
        raise SystemExit("hand-seed refers to descriptions TACO does not have:\n  " + "\n  ".join(missing))

    id_by_desc = {f[2]: f[0] for f in foods}
    aliases, alias_keys = [], set()
    for alias, desc in ALIASES.items():
        nn = normalize(alias)
        if nn in seen or nn in alias_keys:  # two spellings can normalize to one key
            print(f"  skip alias {alias!r} - {nn!r} is already taken")
            continue
        alias_keys.add(nn)
        aliases.append((nn, id_by_desc[desc]))

    body = [HEADER_FOOD]
    body.append("INSERT INTO food (id, name_norm, name_pt, kcal_100g, protein_100g, carb_100g,")
    body.append("                  fat_100g, grams_per_unit, source, source_ref) VALUES")
    body.append(
        ",\n".join(
            "  ({}, {}, {}, {}, {}, {}, {}, {}, {}, {})".format(
                q(i), q(nn), q(d), k,
                "NULL" if p is None else p,
                "NULL" if c is None else c,
                "NULL" if f is None else f,
                "NULL" if g is None else g,
                q(s), q(sr),
            )
            for i, nn, d, k, p, c, f, g, s, sr in foods
        )
        + ";"
    )
    body.append("")
    body.append("INSERT INTO food_alias (name_norm, food_id) VALUES")
    body.append(",\n".join(f"  ({q(a)}, {q(i)})" for a, i in aliases) + ";")
    body.append("")
    print(f"food rows={len(foods)} aliases={len(aliases)}")
    return "\n".join(body)


# ----------------------------------------------------------------- EXERCISE
# EXCAT — the handoff's 47 hand-weighted entries (docs/v4.2/HANDOFF_v4.2_manual_setup.md
# section 3.4), verbatim. [name, family, {app muscle key: weight}, whole_body].
EXCAT = [
    ("Squat", "set", {"qu": 1, "gl": .85, "co": .3}, False),
    ("Front squat", "set", {"qu": 1, "co": .4, "gl": .6}, False),
    ("Leg press", "set", {"qu": 1, "gl": .6}, False),
    ("Lunges", "set", {"qu": .9, "gl": .9, "ha": .4}, False),
    ("Romanian deadlift", "set", {"ha": 1, "gl": .85, "bk": .5}, False),
    ("Deadlift", "set", {"ha": 1, "gl": .9, "bk": .75, "tr": .5, "co": .45}, False),
    ("Hip thrust", "set", {"gl": 1, "ha": .5}, False),
    ("Leg curl", "set", {"ha": 1}, False),
    ("Calf raise", "set", {"ca": 1}, False),
    ("Bench press", "set", {"ch": 1, "ar": .6, "sh": .5}, False),
    ("Incline press", "set", {"ch": 1, "sh": .7, "ar": .5}, False),
    ("Push-up", "set", {"ch": .9, "ar": .6, "co": .4}, False),
    ("Dip", "set", {"ch": .8, "ar": .9}, False),
    ("Pull-up", "set", {"bk": 1, "ar": .7}, False),
    ("Lat pulldown", "set", {"bk": 1, "ar": .55}, False),
    ("Seated row", "set", {"bk": 1, "ar": .6, "tr": .5}, False),
    ("Barbell row", "set", {"bk": 1, "tr": .6, "ar": .55, "co": .3}, False),
    ("Overhead press", "set", {"sh": 1, "ar": .6, "tr": .45}, False),
    ("Lateral raise", "set", {"sh": 1}, False),
    ("Face pull", "set", {"sh": .7, "tr": .8, "bk": .5}, False),
    ("Biceps curl", "set", {"ar": 1}, False),
    ("Triceps rope", "set", {"ar": 1}, False),
    ("Ab wheel", "set", {"co": 1}, False),
    ("Plank", "time", {"co": 1}, False),
    ("Running", "time", {"qu": .5, "ha": .45, "ca": .6, "gl": .3}, True),
    ("Trail run", "time", {"qu": .55, "ha": .5, "ca": .6, "gl": .4}, True),
    ("Cycling", "time", {"qu": .65, "gl": .4, "ca": .35}, True),
    ("Spinning class", "time", {"qu": .7, "gl": .45, "ca": .3}, True),
    ("Swimming", "time", {"bk": .6, "sh": .6, "ar": .5, "co": .4}, True),
    ("Rowing machine", "time", {"bk": .7, "qu": .5, "ar": .45, "co": .35}, True),
    ("Jump rope", "time", {"ca": .6, "qu": .35}, True),
    ("Boxing", "time", {"sh": .5, "ar": .5, "co": .5, "bk": .35}, True),
    ("Muay thai", "time", {"qu": .45, "co": .5, "sh": .45, "ar": .4}, True),
    ("BJJ", "time", {"bk": .5, "ar": .5, "co": .5, "gl": .3}, True),
    ("Football", "time", {"qu": .55, "ha": .5, "ca": .45, "gl": .35}, True),
    ("Basketball", "time", {"qu": .5, "ca": .45, "co": .35}, True),
    ("Tennis", "time", {"sh": .4, "ar": .4, "qu": .4, "co": .35}, True),
    ("Crossfit WOD", "time", {"qu": .5, "sh": .5, "bk": .45, "ar": .45, "co": .45, "gl": .4}, True),
    ("HIIT circuit", "time", {"qu": .5, "co": .45, "sh": .35, "ar": .35}, True),
    ("Yoga", "time", {"co": .5, "ha": .4, "sh": .35}, True),
    ("Pilates", "time", {"co": .7, "gl": .35}, True),
    ("Stair climber", "time", {"qu": .6, "gl": .55, "ca": .4}, True),
    ("Hiking", "time", {"qu": .5, "gl": .45, "ca": .4}, True),
    ("Climbing", "time", {"bk": .6, "ar": .7, "co": .5}, True),
    ("Dance class", "time", {"qu": .4, "ca": .35, "co": .35}, True),
    ("Walk", "time", {"qu": .3, "ca": .3}, True),
]

# backend-plan.md section 1.3 — the app's 10 body-map keys onto Muscles.VOCAB.
# `ar` (Arms) is the only one-to-many: it lights both biceps and triceps.
APP_KEY = {
    "ch": ["chest"], "bk": ["back"], "sh": ["shoulders"], "ar": ["biceps", "triceps"],
    "tr": ["traps"], "co": ["core"], "qu": ["quads"], "ha": ["hamstrings"],
    "gl": ["glutes"], "ca": ["calves"],
}
PRIMARY_CUT = .7  # CEO Round 15: the same .7 as the app's tierOf

# free-exercise-db vocabulary onto Muscles.VOCAB. Unmappable -> dropped, never guessed:
# `adductors` and `neck` have no silhouette, so those roles simply do not exist for us.
FEDB_MUSCLE = {
    "quadriceps": "quads", "hamstrings": "hamstrings", "calves": "calves", "glutes": "glutes",
    "chest": "chest", "shoulders": "shoulders", "triceps": "triceps", "biceps": "biceps",
    "forearms": "forearms", "abdominals": "core", "lats": "back", "middle back": "back",
    "lower back": "back", "traps": "traps", "abductors": "glutes",
}


# Ours, curated — the same free lever as food_alias, and it closes a gap the plan did
# not see: EXCAT and free-exercise-db are 100% ENGLISH, so every Portuguese name the CEO
# types would miss. Value = the seeded exercise `name` it resolves to; the script fails
# if that name was not seeded. "bulgarian split squat" is here because free-exercise-db
# has no Bulgarian row at all (verified at import) and the nearest, "Split Squats",
# scores .435 — just under the 0.45 floor, which ADR-0020 forbids lowering.
EX_ALIASES = {
    "bulgarian split squat": "Split Squats",
    "agachamento": "Squat", "agachamento livre": "Squat",
    "afundo": "Lunges", "avanco": "Lunges",
    "levantamento terra": "Deadlift", "terra": "Deadlift",
    "stiff": "Romanian deadlift",
    "elevacao pelvica": "Hip thrust",
    "mesa flexora": "Leg curl",
    "panturrilha": "Calf raise",
    "supino": "Bench press", "supino reto": "Bench press", "supino inclinado": "Incline press",
    "flexao": "Push-up", "flexao de braco": "Push-up",
    "paralela": "Dip", "mergulho": "Dip",
    "barra fixa": "Pull-up",
    "puxada": "Lat pulldown", "puxada frontal": "Lat pulldown",
    "remada": "Seated row", "remada curvada": "Barbell row",
    "desenvolvimento": "Overhead press",
    "elevacao lateral": "Lateral raise",
    "rosca": "Biceps curl", "rosca direta": "Biceps curl",
    "triceps corda": "Triceps rope", "triceps": "Triceps rope",
    "abdominal": "Sit-Up", "abdominais": "Sit-Up",
    "prancha": "Plank",
    "corrida": "Running", "correr": "Running", "esteira": "Running",
    "caminhada": "Walk", "caminhar": "Walk",
    "bicicleta": "Cycling", "ciclismo": "Cycling", "pedalar": "Cycling",
    "natacao": "Swimming", "nadar": "Swimming",
    "remo": "Rowing machine",
    "pular corda": "Jump rope",
    "boxe": "Boxing",
    "jiu jitsu": "BJJ", "jiu-jitsu": "BJJ",
    "futebol": "Football",
    "basquete": "Basketball",
    "tenis": "Tennis",
    "ioga": "Yoga",
    "danca": "Dance class",
    "escalada": "Climbing",
    "trilha": "Hiking",
}


def roles_from_weights(weights: dict) -> list:
    out = {}
    for key, w in weights.items():
        for muscle in APP_KEY[key]:
            role = "primary" if w >= PRIMARY_CUT else "secondary"
            if out.get(muscle) != "primary":
                out[muscle] = role
    return list(out.items())


def exercise_sql() -> str:
    exercises, muscles, seen = [], [], set()

    def add(name, family, whole, source, ref, roles):
        nn = normalize(name)
        if nn in seen:
            return False
        seen.add(nn)
        eid = det_uuid("exercise", f"{source}:{ref}")
        exercises.append((eid, nn, name, family, whole, source, ref))
        for muscle, role in roles:
            muscles.append((eid, muscle, role))
        return True

    for name, family, weights, whole in EXCAT:
        add(name, family, whole, "excat", name, roles_from_weights(weights))
    excat_n = len(exercises)

    collisions = 0
    for e in fetch(FEDB_URL):
        roles = {}
        for m in e.get("primaryMuscles") or []:
            v = FEDB_MUSCLE.get(m)
            if v:
                roles[v] = "primary"
        for m in e.get("secondaryMuscles") or []:
            v = FEDB_MUSCLE.get(m)
            if v and v not in roles:
                roles[v] = "secondary"
        family = "time" if e.get("category") == "cardio" else "set"
        if not add(e["name"].strip(), family, False, "free-exercise-db", e["id"], list(roles.items())):
            collisions += 1

    id_by_name = {e[2]: e[0] for e in exercises}
    missing = [n for n in EX_ALIASES.values() if n not in id_by_name]
    if missing:
        raise SystemExit("exercise aliases point at names that were not seeded:\n  " + "\n  ".join(missing))
    ex_aliases, ex_alias_keys = [], set()
    for alias, name in EX_ALIASES.items():
        nn = normalize(alias)
        if nn in seen or nn in ex_alias_keys:  # "jiu jitsu" / "jiu-jitsu" are one key
            print(f"  skip exercise alias {alias!r} - {nn!r} is already taken")
            continue
        ex_alias_keys.add(nn)
        ex_aliases.append((nn, id_by_name[name]))

    body = [HEADER_EXERCISE]
    body.append("INSERT INTO exercise (id, name_norm, name, family, whole_body, source, source_ref) VALUES")
    body.append(
        ",\n".join(
            "  ({}, {}, {}, {}, {}, {}, {})".format(q(i), q(nn), q(n), q(f), str(w).lower(), q(s), q(r))
            for i, nn, n, f, w, s, r in exercises
        )
        + ";"
    )
    body.append("")
    body.append("INSERT INTO exercise_muscle (exercise_id, muscle, role) VALUES")
    body.append(",\n".join(f"  ({q(i)}, {q(m)}, {q(r)})" for i, m, r in muscles) + ";")
    body.append("")
    body.append("INSERT INTO exercise_alias (name_norm, exercise_id) VALUES")
    body.append(",\n".join(f"  ({q(a)}, {q(i)})" for a, i in ex_aliases) + ";")
    body.append("")
    print(f"exercise aliases={len(ex_aliases)}")
    print(f"exercise rows={len(exercises)} (excat={excat_n}, public={len(exercises) - excat_n}, "
          f"name collisions won by EXCAT={collisions}) muscle rows={len(muscles)}")
    return "\n".join(body)


HEADER_FOOD = """-- V013 - food reference table + alias list + estimate cache (BE-060, v4.2).
-- PUBLIC REFERENCE DATA, PLAINTEXT BY DESIGN: not one byte here belongs to a user,
-- so ADR-0003's C3 encryption does not apply and is not weakened by its absence.
-- The rows ARE the seed (ADR-0020 decision 6): Flyway already runs on boot, so no
-- loader code, no bucket, and the data is versioned and auditable in git.
-- Generated by backend/tools/gen_seed_migrations.py - edit the script, not this file.
--
-- PROVENANCE / LICENCE, re-read at download time on 2026-08-24 (ADR-0020 decision 9):
--   source = 'taco-4' -> Tabela Brasileira de Composicao de Alimentos (TACO), 4a edicao,
--   NEPA/UNICAMP 2011, obtained from the mirror github.com/marcelosanto/tabela_taco
--   (file TACO.json, 597 rows). What the licence text ACTUALLY says, as found:
--     * The mirror repository ships an MIT LICENSE ("Copyright (c) 2023 Marcelo Santos")
--       and its README states "Este projeto esta sob a licenca MIT". That MIT grant is
--       the repository owner's, over the repository - it is NOT a grant from NEPA/UNICAMP
--       and cannot be, since he is not the rights holder of the underlying table.
--     * The underlying TACO table itself carries NO explicit redistribution licence.
--       NEPA/UNICAMP publishes it free for consultation; nothing in the mirror, and
--       nothing we could find at download time, grants redistribution inside a product.
--   Conclusion, unchanged from ADR-0020 decision 9: fine for a pre-production
--   single-user app, NOT settled for the Play Store. Contained by design - provenance
--   is the per-row source/source_ref pair, the seed is this one migration, and the swap
--   path (USDA FoodData Central values, public domain, under our own PT-BR name list)
--   is a re-run of the generator.
--
-- Expand-only (ADR-0002).

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE food (
    id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name_norm      text NOT NULL UNIQUE,          -- NameNorm.of(name_pt); the lookup key
    name_pt        text NOT NULL,                 -- as published, accents and all
    kcal_100g      numeric NOT NULL CHECK (kcal_100g >= 0),
    protein_100g   numeric CHECK (protein_100g >= 0),
    carb_100g      numeric CHECK (carb_100g >= 0),
    fat_100g       numeric CHECK (fat_100g >= 0),
    grams_per_unit numeric CHECK (grams_per_unit > 0), -- NULL => a `unit` lookup MISSES
    source         text NOT NULL,                 -- dataset id, e.g. 'taco-4'
    source_ref     text NOT NULL                  -- row id inside that dataset
);

-- The fuzzy matcher (similarity >= 0.45). No new dependency: pg_trgm is contrib.
CREATE INDEX food_name_norm_trgm ON food USING gin (name_norm gin_trgm_ops);

-- Ours, curated: the free lever when a bare word falls under the trigram floor
-- ("aveia" scores .33 against "Aveia, flocos, crua"). Never a lower threshold.
CREATE TABLE food_alias (
    name_norm text PRIMARY KEY,
    food_id   uuid NOT NULL REFERENCES food (id) ON DELETE CASCADE
);

-- Claude's answers for what the table missed. USER-LESS BY DESIGN (ADR-0020 decision 8):
-- a normalized name, a unit, a number. No user_id, no user-tied timestamp, no quantity -
-- divorced from who typed it, a food name is not personal data. Do NOT add a user_id:
-- that turns a reference table into an unencrypted log of what people eat.
-- Disposable: one TRUNCATE resets it.
CREATE TABLE food_estimate_cache (
    name_norm  text NOT NULL,
    unit       text NOT NULL,
    kcal       integer NOT NULL CHECK (kcal >= 0),
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (name_norm, unit)
);
"""

HEADER_EXERCISE = """-- V014 - exercise reference table + estimate cache (BE-062, v4.2).
-- Same stance as V013: public reference data, plaintext, no user in it.
-- Generated by backend/tools/gen_seed_migrations.py - edit the script, not this file.
--
-- PROVENANCE / LICENCE, re-read at download time on 2026-08-24:
--   source = 'excat' -> ours. The 47 hand-weighted catalog entries from the CEO's
--   Claude-Design handoff v4.2 section 3.4 (docs/v4.2/HANDOFF_v4.2_manual_setup.md).
--   Weights became roles at the CEO Round-15 cut (w >= .7 primary, else secondary) and
--   the app's 10 body-map keys became Muscles.VOCAB per backend-plan.md section 1.3
--   (`ar` -> biceps AND triceps). EXCAT WINS every name collision with the public set.
--
--   source = 'free-exercise-db' -> github.com/yuhonas/free-exercise-db, dist/exercises.json
--   (873 rows). What the licence text ACTUALLY says, as found: the repository declares
--   The Unlicense (GitHub reports spdx `Unlicense`; LICENSE.md carries the standard
--   Unlicense text and the README badges "License: Unlicense", describing the project as
--   an "Open Public Domain Exercise Dataset"). The Unlicense is a public-domain dedication
--   with a fallback permissive licence - no attribution obligation, no share-alike.
--   Nothing to settle before publishing. Its muscle vocabulary is folded onto
--   Muscles.VOCAB; `adductors` and `neck` have no silhouette here and are DROPPED
--   rather than guessed at.
--
--   wger was evaluated and NOT taken: CC-BY-SA 4.0 (attribution + share-alike on
--   derivatives) for ~600 exercises whose only edge is pt-BR names - not worth the
--   obligation when the model answers a PT name for a fraction of a cent (ADR-0020 d.9).
--
-- Expand-only (ADR-0002).

CREATE TABLE exercise (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name_norm  text NOT NULL UNIQUE,        -- NameNorm.of(name); the lookup key
    name       text NOT NULL,
    family     text NOT NULL CHECK (family IN ('set', 'time')),
    whole_body boolean NOT NULL DEFAULT false, -- "the split is a guess" (contract wholeBody)
    source     text NOT NULL,
    source_ref text NOT NULL
);

CREATE INDEX exercise_name_norm_trgm ON exercise USING gin (name_norm gin_trgm_ops);

-- Muscles.VOCAB only - SeedVocabularyTest asserts that over the whole table.
CREATE TABLE exercise_muscle (
    exercise_id uuid NOT NULL REFERENCES exercise (id) ON DELETE CASCADE,
    muscle      text NOT NULL,
    role        text NOT NULL CHECK (role IN ('primary', 'secondary')),
    PRIMARY KEY (exercise_id, muscle)
);

-- Ours, curated - the same lever as food_alias. EXCAT and free-exercise-db are entirely
-- ENGLISH, so without this every Portuguese name misses; and "bulgarian split squat" has
-- no row at all in the public set (nearest "Split Squats" scores .435, under the 0.45
-- floor ADR-0020 forbids lowering).
CREATE TABLE exercise_alias (
    name_norm   text PRIMARY KEY,
    exercise_id uuid NOT NULL REFERENCES exercise (id) ON DELETE CASCADE
);

-- Same user-less, disposable cache stance as food_estimate_cache (ADR-0020 decision 8).
CREATE TABLE exercise_estimate_cache (
    name_norm    text PRIMARY KEY,
    payload_json jsonb NOT NULL,
    created_at   timestamptz NOT NULL DEFAULT now()
);
"""


if __name__ == "__main__":
    (OUT / "V013__food_tables.sql").write_text(food_sql(), encoding="utf-8")
    (OUT / "V014__exercise_tables.sql").write_text(exercise_sql(), encoding="utf-8")
    print("wrote", OUT / "V013__food_tables.sql", "and", OUT / "V014__exercise_tables.sql")

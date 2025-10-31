## Sprint LITE · Status System Migration

> Cieľ: prejsť z token-špagiet na jednotný status runtime bez toho, aby sme rozbili hrateľnosť. Päť izolovaných PR, každý samostatne releasovateľný.

### PR‑L5a · Status runtime skeleton
- **Čo:** Zaviesť `src/engine/status/**` (typy, registry, runtime helpery) bez použitia v existujúcom kóde.
- **Deliverables:**
  - `types.ts`, `registry.ts`, `runtime.ts`, `index.ts`
  - základné definície pre `chi`, `evasive`, `burn` v `defs.ts` (len registrácia, žiadne side‑effects).
  - Unit testy pre `tickStatuses`, `spendStatus`, `applyModifiers`.
- **Akceptácia:** žiadne volania z hry, lint/test zelené.

### PR‑L5b · Burn → nový runtime
- **Čo:** Migrovať burn ticky a cleanse z `src/game/statuses/**` do nového runtime.
- **Deliverables:**
  - `tickStatuses` volané v upkeep (GController / engine flow).
  - Odstránenie starého `game/statuses` modulu.
  - UI/logy zachované (Burn damage, cleanse prompt).
- **Akceptácia:** Burn funguje rovnako ako doteraz; tests pokrývajú damage + decay + cleanse.

### PR‑L5c · Chi/Evasive spending flow
- **Čo:** Presunúť spend UI na `spendStatus`.
- **Deliverables:**
  - UI prompt pre Attack/Defense spend číta registry (`allowedPhases`, `needsRoll`).
  - `spendStatus` volané z hookov miesto manuálneho `chiStep` logiky.
  - Defense pipeline upravená: Evasive predisponuje roll, priamo cez runtime.
- **Akceptácia:** Chi/Evasive fungujú, regresné testy/UX pre confirm attack & defense pass.

### PR‑L5d · Engine resolve/board integration
- **Čo:** Uprav `resolveAttack`, `defensePipeline`, a logging tak, aby zdroje (bonusy/negácie) pochádzali z runtime.
- **Deliverables:**
  - `applyModifiers` volané na attacker/defender pred damage.
  - Board abilities vracajú len grantStatus/block/reflect; status získanie cez `addStacks`.
  - Combat log zachytáva spend/modify logy.
- **Akceptácia:** Golden combat test (seed) stále deterministický; staré manuálne token apply/consume odstránené.

### PR‑L5e · Cleanup & UI polish
- **Čo:** Upratať zvyšné použitia `tokens` (TokenChips, AI heuristiky, active abilities).
- **Deliverables:**
  - TokenChips číta registry (`getStatus`) pre label/icon (fallback default).
  - AI rozhodovanie používa `getStacks`.
  - Dokumentácia + dev-notes (README/CONTRIBUTING).
- **Akceptácia:** Pre-search `git grep tokens.` neukazuje „chi/evasive/burn“ logiku mimo status runtime; tests zelené.

---

> Každý PR končí testami (`npm run test`) + mini changelogom. Pri veľkých súboroch (GameController, useDefenseActions) udržuj commit diffs čitateľné – radšej viac menších commitov než jeden mega dif. Samostatne kontroluj `TokenChips`, `combatLog`, `aiController` pre regresie.

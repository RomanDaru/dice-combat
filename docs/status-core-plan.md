# Status Core Investigation & Remediation Plan

⚠️ **Scope**: Nadväzujeme na `docs/chi-status.md` a `docs/prevent-half.md`. Oba prípady odhaľujú diery v jadre status systému – chceme riešiť príčinu, nie len konkrétne symptómy. UI vrstvy ani starý defense board sa netýkame.

## 1. Problémová mapa
| Status | Symptómy | Dôležité súbory |
| --- | --- | --- |
| Chi (`bonus_pool`) | Spendy sa občas prejavia neskoro (duplicitné granty, turn budget anomaly). | `src/engine/status/defs.ts`, `src/context/GameController.tsx` (status requests + budgets + pending buffs), `src/game/combat/defensePipeline.ts`, `src/engine/status/runtime.ts`, `src/hooks/usePlayerDefenseController.ts`.
| Prevent Half (schema grant) | Status síce vzniká, ale nemá behavior, ani správnu fázu; hráči dostávajú „prázdny“ token. | `src/defense/effects.ts`, `src/game/combat/defenseSchemaRuntime.ts`, `src/game/defenseBuffs.ts`, `src/engine/resolveAttack.ts`.

## 2. Core súbory na audit
1. **Engine/Status Layer**
   - `src/engine/status/defs.ts` – definície, `defineStatus` volania.
   - `src/engine/status/runtime.ts` – `spendStatusMany`, `applyModifiers`, spotreba stackov, výstupy do `StatusSpendSummary`.
   - `src/engine/status/registry.ts` – zaregistrované statusy.
2. **Game Controller / Buff Pipeline**
   - `src/context/GameController.tsx` (cca riadky 320–620, 870–940) – `applyPendingDefenseBuff`, `adjustStatusRequest`, `turnStatusBudgets`, `triggerDefenseBuffs`.
   - `src/game/defenseBuffs.ts` – tvorba a uvoľnenie `PendingDefenseBuff` podľa fázy.
3. **Defense Execution**
   - `src/game/combat/defensePipeline.ts` – aplikácia spend requests.
   - `src/engine/resolveAttack.ts` – final damage pipeline (potenciálny hook pre prevent-half).
   - `src/hooks/useDefenseActions.ts` + `src/hooks/usePlayerDefenseController.ts` – orchestrácia požiadaviek, clearing.

### Súbory ktorých sa NEchytáme (ak to nie je nevyhnutné)
- Všetky UI vrstvy (`src/components/...`, CSS).
- Legacy defense board definície v `src/game/heroes.ts` (nezasahovať, kým nevyriešime jadro).
- Stats/telemetry (`src/stats/...`) – iba ak po úpravách budú vyžadovať nové polia.

## 3. Návrhy riešení
### Variant A - "Status Runtime Contract"
Ciel: spevnit status engine tak, aby kazda buduca definicia (bez ohladu na konkretny status) presla rovnako vystopovatelnym cyklom grant -> pending buff -> spend -> consume -> log/telemetry, bez jedinej hardcodovanej vynimky.

#### A. Kontrakt & dokumentacia
1. Spisat povinne polia `defineStatus` + ich mapovanie na runtime (`behaviorId`, `spend`, `windows`, `usablePhase`, `turnLimited`, `maxStacks`). Vysledok drzat v tomto plane + ak treba vytvorit `docs/status-runtime.md` so sekciou "Lifecycle Contract".
2. Zadefinovat genericku strukturu `StatusLifecycleEvent` (napr. `{ type, statusId, stacks, source, phase, turnId }`) a popisat, ktore subsystemy su povinne tieto eventy emitovat/pocuvat (GameController, hooks, telemetry, simy).

#### B. Runtime instrumentacia (`src/engine/status/runtime.ts`)
3. Instrumentovat helpery (`setStacks`, `addStacks`, `spendStatus`, `spendStatusMany`, `applyModifiers`, `tickStatuses`) tak, aby emitovali `StatusLifecycleEvent` pri kazdom prirastku/ubytku stacku. DEV buildy -> `defenseDebugLog`, produkcia -> strukturovane telemetry. Nova data musia rozsirit `StatusSpendSummary`, nie ho nahradit.
4. Zabezpecit, aby existujuci odberatelia (`useDefenseActions`, `usePlayerDefenseController`, `useAiDefenseResponse`, `resolveAttack`) pouzivali tie iste eventy na vysvetlenie spendov, ale bez potreby vediet o konkretnom statusId.

#### C. Behavior API (`src/engine/status/behaviors/*`)
5. Rozsirit `StatusBehaviorHandlers` o volitelne hooky (`onGrant`, `onSpend`, `onModify`, `onConsume`, `onExpire`). Behavior implementacie sa stanou jedinym miestom, kde sa riesi status-unikatna logika; runtime iba orchestruju lifecycle eventy.
6. Pridat registry/helpery pre behavior hooky, aby novy status mohol deklarovat custom krok bez toho, aby sme pridavali `if (statusId === "...")`.

#### D. Genericke testy / simulacie
7. Vytvorit data-driven Vitest modul (napr. `src/engine/status/__tests__/lifecycleMatrix.test.ts`), ktory cez `listStatuses()` generuje scenare (grant pred spendom, spend bez grantov, turn-limited budget, stack cap, paralelne pending buffy, AI reakcie). Ziadne hardcodovanie na Chi/Evasive/Prevent Half.
8. Rozsirit simulacie/harness (`src/sim/statusHarness.ts` alebo existujuce test utilities) tak, aby vedeli prehrat cely lifecycle pre lubovolny status a validovat eventy/logy.

#### E. Logging & Telemetry
9. Zjednotit logovanie (`defenseDebugLog`, combat log buildery, stats tracker) okolo `StatusLifecycleEvent`. GameController nech pri `applyPendingDefenseBuff`/`triggerDefenseBuffs` vypisuje iba event payload; `resolveAttack` ma referencovat event ID v logoch, stats buduju agregacie podla behaviorId/fazy.
10. Telemetry (`src/stats/*`) ma ingestovat eventy a pocitat metriky (granty/spendy/consumy per status/behavior), aby dokazala monitorovat aj buduce statusy bez kodovych zmien.

#### F. Rizika & mitigacie
- *Prebytok eventov*: moze zahlti debug logy. -> **Mitigacia**: verbose rezim nech je len v DEV + produkcny sampling/aggregacia.
- *Spatna kompatibilita so summary*: aktualne AI/telemetry stoji na `StatusSpendSummary`. -> **Mitigacia**: dualne zapisovanie (summary + eventy), summary odstranime az po migracii spotrebitelov.
- *Test matrix runtime*: stovky statusov mozu spomalit Vitest. -> **Mitigacia**: deterministicke scenare, minimalne stuby bez RNG, moznost filtrovat podla behavior/tagu.
- *Neuplne metadata grantov*: niektore buffy nemaju `source`. -> **Mitigacia**: sprisnit `buildPendingDefenseBuffsFromGrants` aby vzdy doplnil `ruleId/effectId`, fallback label iba ak zdroj neznamy.
### Variant B – „Phase & Buff Synchronization“
Cieľ: zosúladiť `PendingDefenseBuff` a `triggerDefenseBuffs` tak, aby granty prišli v očakávanej fáze a nemiešali sa so spendovými tokenmi.
- **Kroky**
  1. Audit `triggerDefenseBuffs` volaní v `GameController` (riady ~585, ~1230) – doplniť konkrétne fázy: `preDefenseRoll`, `nextDefenseCommit`, `preApplyDamage`.
  2. V `buildPendingDefenseBuffsFromGrants` uložiť `source.ruleId` a `usablePhase`; pri logovaní v `applyPendingDefenseBuff` pridať túto informáciu.
  3. Pre Prevent Half zmeniť `DEFAULT_PREVENT_PHASE` v `src/defense/effects.ts` na `nextDefenseCommit` a doplniť `triggerDefenseBuffs("nextDefenseCommit")` pri ukončení obrany.
  4. Zaviesť „virtual tokens“ v `GameController` (plán pre Chi): `player.tokens` + pending grants – pending spends = derived view pre engine.
- **Riziká**
  - *Neaktivované granty*: ak neexistuje `triggerDefenseBuffs` pre novú fázu, buff ostane navždy v pending stave. → **Mitigácia**: po pridaní nového triggeru napísať integration test v `usePlayerDefenseController` (simulate schema roll + next defense) a overiť, že buff sa aplikuje.
  - *Duplicity v logoch*: viac logov môže zahltiť CombatLog. → **Mitigácia**: zoskupenie logov cez `defenseDebugLog` only in dev.

### Variant C – „Status Lifecycle Regression Harness“
Cieľ: namiesto ručného debugovania vytvoriť deterministický defense-v2 harness, ktorý genericky prejde celé životné cykly stavov (grant -> pending buff -> trigger -> spend/consume -> telemetry) bez hardcodov na konkrétne ID.
- **Kroky**
  1. V `src/sim/` pridať modul `statusHarness.ts`, ktorý skladá existujúce primitivá (`createInitialState`, `buildPendingDefenseBuffsFromGrants`, `deriveVirtualTokensForSide`, `buildDefensePlan`, `resolveAttack`) a dočasne registruje `StatusLifecycleSink`, aby vedel zachytiť grant/spend/consume eventy pre tvrdenia. Harness bude pracovať iba so schema-based (defense-v2) pipeline.
  2. Zaviesť dátovo definované scenáre: pomocou `listStatuses()` automaticky vyhľadať statusy s rovnakým `behaviorId`/oknami, doplniť parametre (počiatočné stacky, pending granty, očakávané fázy, deterministické hody) a v scenári popísať očakávané token dify + eventy. Žiadne `if (statusId === "chi")` – špecifiká čerpáme len z definície/behavior configu.
  3. Pridať Vitest balík (napr. `src/engine/status/__tests__/statusHarness.test.ts`), ktorý cez tieto scenáre spustí harness, overí výsledný `AttackResolution`, tok `StatusLifecycleEvent` a záznam v `StatsTracker`. Výstupy nech sú deterministické (fixné roll seed), aby sa testy dali zaradiť do CI.
  4. Testy integrovať do existujúceho `pnpm test`/CI kroku, dokumentovať nový tooling (`docs/sim/status-harness.md` alebo aktualizácia tohto plánu) a nastaviť pravidlo – pri pridaní nového statusu sa musí doplniť aj scenár v harness-e.
- **Riziká**
  - *Nedostatočná generickosť*: ak scénarová vrstva vyžaduje manuálne ID, stratíme benefit. → **Mitigácia**: generovať scenáre podľa `behaviorId`, `windows` a `spend` metadát + umožniť custom hook len cez konfig.
  - *Údržbové náklady*: zmeny engine môžu rozbiť veľa scenárov naraz. → **Mitigácia**: dodať helpery na spätné porovnanie očakávaných eventov (snapshot-like assert) a jasne logovať, ktorý behavior zlyhal.
  - *Čas buildov*: stovky statusov môžu predĺžiť CI. → **Mitigácia**: umožniť filtrovanie podľa tagu/behavior a defaultne spúšťať len reprezentantov (napr. jeden scenár na behavior), s možnosťou úplného behu v nightly.
- **2025-11-17 Update**: `src/sim/statusHarness.ts` + `src/engine/status/__tests__/statusHarness.test.ts` + `docs/sim/status-harness.md` implementujú Variant C. Scenáre sa generujú z `listStatuses()` podľa `behaviorId` (bonus_pool, pre_defense_reaction) a pokrývajú granty, pending buff pipeline a reakcie bez hardcodu na konkrétne ID.

## 4. Odporúčanie
- **Začať Variantom B** (synchronizácia fáz + logging). Vyrieši, prečo Chi/Prevent Half pôsobia nekonzistentne, a pripraví pôdu pre Variant A.
- Po stabilizácii pipeline implementovať Variant A (engine-level upgrades) → pridá definíciu Prevent Half a odstráni potrebu ručných zásahov.
- Variant C spustiť paralelne ako guardrail (generický status harness pre defense-v2).

## 5. Best Practices & Guardrails
- **Bez god-súborov**: ak bude treba nové helpery, dať ich do existujúcich modulov (`engine/status/behaviors`, `game/defenseBuffs`) alebo vytvoriť malý modul (napr. `statusLifecycle.ts`).
- **Žiadne UI zmeny**: TokenChips a spol. nechávame tak, kým backend pipeline nebude konzistentná.
- **Version control**: každú úpravu robiť v samostatných commitoch (napr. „phase triggers“, „prevent-half definition“, „status harness“).
- **Dokumentácia**: po každom mile-stone (napr. dokončení kroku Variant A/B/C) aktualizovať príslušné dokumenty (`docs/status-core-plan.md`, špecifické statusové plány), aby zostal zdroj pravdy v sync s kódom.
- **Logging**: do produkcie nepúšťať debug spam; `defenseDebugLog` už existuje – doplniť iba štruktúrované payloady.

---
Tento dokument slúži ako master plán pre refaktoring status systému. Každé riešenie odkazuje na presné súbory a kroky, ktoré treba spraviť, a zároveň upozorňuje, ktorých modulov sa nemáme dotýkať.

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
### Variant A – „Status Runtime Contract“
Cieľ: zosilniť engine tak, aby každý status definovaný cez `defineStatus` mal jasný cycle (spend, grant, consume) bez obchádzok.
- **Kroky**
  1. V `src/engine/status/defs.ts` doplniť chýbajúce definície (Prevent Half) a doplniť explicitné `usablePhase` aliasy.
  2. Rozšíriť `applyModifiers`/`spendStatusMany` aby poskytovali hook na „consume on modify“ (napr. prevent-half = zníž damage, odober stack).
  3. Pridať jednotné logovanie (`StatusLifecycleEvent`) priamo do `runtime.ts`, aby každé pridanie/odobratie stacku bolo trackované.
- **Riziká**
  - *Regression across existing statuses*: `bonus_pool` (Chi) aj `pre_defense_reaction` (Evasive) bežia cez tieto funkcie – úprava by mohla zmeniť ich výstup. → **Mitigácia**: vytvoriť unit testy pre Chi/Evasive+PreventHalf (Vitest) pred úpravou.
  - *Overcoupling*: hrozí, že do runtime pridáme príliš špecifickú logiku. → **Mitigácia**: použitie behavior pluginov; ak status potrebuje custom krok, nech definuje `behaviorId` a handler ho spracuje, nie hardcoded `if`.

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

### Variant C – „Status Regression Harness“
Cieľ: namiesto ručného debugovania pridať automatizovaný harness, ktorý spustí mini-simulácie pre každý status.
- **Kroky**
  1. V `src/sim/` pridať skript (napr. `statusHarness.ts`) ktorý používa `resolveAttack`, `buildDefensePlan` a `triggerDefenseBuffs` na simulovanie cyklu (grant -> spend -> outcome).
  2. Pre Chi, Prevent Half a Evasive vytvoriť sample scenáre (Vitest) – validujú, že po jednej obrane ostanú očakávané stacky a damage.
  3. Integráciu spustiť v CI (Vitest task) – chráni pred budúcimi regresiami.
- **Riziká**
  - *Falošná istota*: ak harness nepokrýva reálne edge cases, môžeme prehliadnuť chyby. → **Mitigácia**: pre každý status definovať minimálne 2 scenáre (grant before spend, spend without grant).
  - *Čas buildov*: simulácie môžu predĺžiť CI. → **Mitigácia**: testy písať deterministicky, bez RNG, aby boli rýchle.

## 4. Odporúčanie
- **Začať Variantom B** (synchronizácia fáz + logging). Vyrieši, prečo Chi/Prevent Half pôsobia nekonzistentne, a pripraví pôdu pre Variant A.
- Po stabilizácii pipeline implementovať Variant A (engine-level upgrades) → pridá definíciu Prevent Half a odstráni potrebu ručných zásahov.
- Variant C spustiť paralelne ako guardrail (automatická regresia pre statusy).

## 5. Best Practices & Guardrails
- **Bez god-súborov**: ak bude treba nové helpery, dať ich do existujúcich modulov (`engine/status/behaviors`, `game/defenseBuffs`) alebo vytvoriť malý modul (napr. `statusLifecycle.ts`).
- **Žiadne UI zmeny**: TokenChips a spol. nechávame tak, kým backend pipeline nebude konzistentná.
- **Version control**: každú úpravu robiť v samostatných commitoch (napr. „phase triggers“, „prevent-half definition“, „status harness“).
- **Logging**: do produkcie nepúšťať debug spam; `defenseDebugLog` už existuje – doplniť iba štruktúrované payloady.

---
Tento dokument slúži ako master plán pre refaktoring status systému. Každé riešenie odkazuje na presné súbory a kroky, ktoré treba spraviť, a zároveň upozorňuje, ktorých modulov sa nemáme dotýkať.

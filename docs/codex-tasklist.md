## Sprint Focus – Dice Tray UX Overhaul

> Cieľ: zjednotiť flow útoku cez nové DiceTray UI, odstrániť rozbité akčné panely a pripraviť UX/haptiku na mobil.

# Tasklist

## PlayerActionPanel.tsx Cleanup

- [ ] Vyhodiť všetky akčné tlačidlá (Roll/Confirm/Pass/Spend) a ponechať iba DiceTray „preview“ s minikockami + tooltip „Tap to roll / open“.
- [ ] Napojiť klik na `controller.openDiceTray()` a presvedčiť sa, že komponent neobsahuje pozostatky starého flow.

## DiceTray.tsx Rework

- [ ] Rozšíriť props o `phase`, `rollsLeft`, `validAbilities`, `selectedAbility`, `onRoll`, `onConfirmAttack`, `onPassTurn`, `onSelectAbility`, `onClose`.
- [ ] Primárna akcia: `phase==="roll"` && `rollsLeft>0` → Roll; `phase==="roll"` && `rollsLeft===0` && `selectedAbility` → Confirm; `phase==="roll"` && `rollsLeft===0` && `!hasValidAbility` → Pass.
- [ ] Renderovať sekciu „Abilities“ (po dohádzaní) so zoznamom `validAbilities`; klik volá `onSelectAbility`.
- [ ] Skryť „Open“ stav – DiceTray sa má zobrazovať ako otvorený panel.

## Controller Updates (GameController / useAttackController)

- [ ] Pridať selektory `const combos = readyForActing;` a `const hasValidAbility = Object.values(combos).some(Boolean);`.
- [ ] Poskytovať DiceTray-u `onRoll`, `onConfirmAttack`, `onPassTurn`, `onSelectAbility`, `selectedAbility`, `rollsLeft`, `phase`, `hasValidAbility`.
- [ ] Upraviť `openDiceTray()` tak, aby len prepínal viditeľnosť; pri `phase !== "roll"` zamknúť akcie (iba vizuálne zobrazenie).

## Action Guards & State Sync

- [ ] Disable Roll ak `rolling.some(Boolean)` alebo `statusActive` alebo `phase !== "roll"` alebo `isDefenseTurn`.
- [ ] Disable Confirm ak `!selectedAbility` alebo `rollsLeft > 0`.
- [ ] Disable Pass ak `hasValidAbility === true`.
- [ ] Guardovať `selectedAbility`: ak `readyForActing` prestane obsahovať vybranú schopnosť, zrušiť výber.
- [ ] Ak sa počas otvoreného DiceTray zmení `phase` (defense, upkeep...), automaticky `onClose()`.

## Focus, Shortcuts & Haptics

- [ ] Po otvorení DiceTray zamerať primárne tlačidlo (Roll/Confirm/Pass).
- [ ] Klávesové skratky: `R` → `onRoll()`, `C` → `onConfirmAttack()`, `P` → `onPassTurn()`, `1–5` → `onSelectAbility(index)`, `Esc` → `onClose()` (ak nie je lock).
- [ ] Pridať haptiku: Roll 20 ms, Confirm 40 ms, Pass 15 ms (mobilná vetva).

## Mobile UX & Locked State

- [ ] Dodržať tap target ≥ 40×40 px a medzery 8–12 px v DiceTray.
- [ ] Pri „locked“ stave (pauzy, animácie) prekryť DiceTray stmavenou vrstvou s textom „Paused“.


# Dice Combat – Product Requirements Document (PRD)

> Draft PRD for Dice Combat (working title). This document captures the product vision, audience, pillars, and MVP boundaries for the game. It is intentionally high-level and player-focused; technical details live in other docs (engine, status, defense, flow).

## 1. Vision & Elevator Pitch

Dice Combat (pracovný názov) je taktický dice battler, kde si hráč vyberie hrdinu a pomocou jeho schopností sa snaží poraziť protivníka v krátkych, intenzívnych súbojoch.  
V centre hry je Spark – spoločný pool troch „iskier“, o ktoré hrdinovia bojujú, aby mohli ovplyvňovať svoje alebo súperove kocky a stať sa tak skutočnými vládcami kociek. Spark je kľúčová mechanika, ktorá hru odlišuje od iných kockových battlerov a je súčasťou už MVP.

### High-level goals

- Doručiť krátke, napínavé 1v1 zápasy, ktoré sa zmestia do pár minút.
- Vytvoriť pocit, že hráč „krúti osud“ – Spark a kocky sú nástroj, nie čistá náhoda.
- Položiť základy pre neskorší online multiplayer a ranked/progres bez toho, aby MVP bolo preťažené.

## 2. Target Audience & Platforms

### Target audience

- Vek: približne 12–100 rokov.
- Hráči strategických, kartových a iných online battler hier (deckbuildery, hero battlery, „dice throne“-štýl).
- Primárne casual publikum s krátkymi session, ale s priestorom pre grinderov, ktorí chcú veľa rýchlych hier a neskôr aj ranked/progres.

### Platforms & session length

- Primárna cieľová platforma: mobil (Android / iOS), s desktop/web buildom pre vývoj a rýchle testovanie.
- MVP: boje trvajú typicky 3–5 minút („záchodovka“ / short-session design).
- Launch scope:
  - Začať proti AI (singleplayer zápasy).
  - Online multiplayer (PVP) je plánovaná budúca fáza, mimo MVP scope.

## 3. Product Pillars

Tieto piliere opisujú pocit z hry, nie implementačné detaily:

1. **Rýchly, napínavý súboj**  
   Krátke 3–5 minútové bitky, kde je stále o čo hrať a napätie graduje až do posledného hodu.

2. **Jednoduché na pochopenie, návykové na hranie**  
   Prvé kolo pochopíš za pár minút, ale kombinácie abilít, statusov a Sparku ťa lákajú skúšať „ešte jeden zápas“.

3. **Spark mení osud zápasu**  
   Rozhodujúce momenty vznikajú vďaka tomu, kto práve ovláda Spark – aj prehrávaný hráč môže na konci zvrátiť celý zápas dobre načasovaným využitím Sparku.

4. **Imersívny duel hrdinov, každý zápas pôsobí čerstvo**  
   Hrdinovia a ich ultimate momenty vytvárajú zapamätateľné duely – aj pri krátkych zápasoch sa cítiš, akoby si viedol vlastný malý „anime súboj kociek“.

## 4. Core Gameplay Loop (MVP)

> Draft – bude sa spresňovať podľa detailného combat a Spark designu.

Z pohľadu hráča:

1. Vyber si hrdinu a súpera (MVP: proti AI).  
2. Začni duel – striedajú sa kolá, hráči hádžu a rerollujú kocky.  
3. Počas svojho kola kombinuješ symboly na kockách, schopnosti a statusy, aby si pripravil útok alebo obranu.  
4. Spark rozhoduje, kto môže v kľúčových momentoch ohnúť pravdepodobnosť vo svoj prospech – ovplyvniť svoje alebo súperove kocky.  
5. Útok sa vyhodnotí, statusy aplikujú svoje efekty (damage over time, štíty, chi, evasive atď.).  
6. Hráči sa prehadzujú v útoku a obrane, HP sa znižujú – cieľom je zraziť súperovi životy na nulu.  
7. Zápas vrcholí v „clutch“ situáciách (napr. obaja na 1 HP, posledná ultimate, Spark swing), až kým jeden z hrdinov nepadne.

## 5. Modes & Progression (MVP scope)

### Game modes

- **MVP:**  
  - Singleplayer duely proti AI (1v1).  
  - Základný výber hrdinu a súpera (žiadny komplexný matchmaking).
- **Out of scope for MVP (future):**  
  - Online multiplayer (PVP ranked/unranked).  
  - Širší meta-progress (ranky, ligy, sezóny).

### Progression

- MVP:
  - Dôraz skôr na mastery hrdinov a statusov než na grindovanie numerických upgradov.
  - Jednoduché odomykanie obsahu (napr. hrdinovia / skiny) môže byť pridané neskôr; detaily TBD.

## 6. Systems Overview (Player-level)

> Technické detaily systémov sú v špecializovaných dokumentoch (`docs/defense-v2.md`, status *docs* atď.). Tu je len produktový prehľad.

- **Dice & rolls** – základný vstup hráča, kde sa rozhoduje medzi riskom a istotou (reroll vs. spokojnosť so symbolmi).  
- **Abilities & combos** – každá postava má sadu schopností, ktoré premieňajú hody kociek na útoky, obranu alebo utility.  
- **Statusy** – trvalejšie efekty, ktoré dávajú zápasu tempo (burn, ochrana, resource tokens…).  
- **Spark (MVP intent)** – centrálna resource/ownership mechanika so spoločným poolom troch „iskier“:
  - Hráč môže Spark získavať, keď „padne na dno“ – typicky po veľkom zásahu a kole, v ktorom sám dosiahol 0 damage (nie zámerne, ale preto, že mu nič nepadlo). Spark tak funguje ako comeback nástroj.  
  - Každý hrdina má svoju „mini-ult cestu“ – špecifický board state (napr. 4× šestka), ktorý reprezentuje jeho osobné poslanie získať Spark; po splnení tejto podmienky získava Spark.  
  - Na vyššej úrovni:  
    - za 1 Spark môže hráč v ktoromkoľvek hode prehodiť ktorúkoľvek svoju kocku,  
    - za 2 Sparky môže prehodiť súperovu kocku,  
    - za 3 Sparky môže otočiť jednu svoju kocku na ľubovoľnú hodnotu (ultimate-level moment; tuning a presná implementácia TBD).  
  - Budú definované ešte 1–2 dodatočné cesty, ako Spark získať alebo ukradnúť súperovi (TBD v detailnom Spark designe).  
- **Defense & reactions** – systém, ktorý umožní hráčovi reagovať na incoming damage (block, evade, transfer…), aby zápas nebol len o „kto prvý hodí ultimate“.

## 7. Content Scope (MVP – draft)

> Konkrétne čísla sú zatiaľ otvorené; tento blok slúži ako miesto, kde sa rozhodne, koľko obsahu MVP naozaj potrebuje.

- **Hero roster (MVP minimum):**
  - Minimálne 2 plnohodnotní hrdinovia, inšpirovaní existujúcimi prototypmi „Pyromancer“ a „Shadow Monk“ (finálne mená TBD kvôli Dice Throne IP).  
  - Training Dummy slúži ako interný vývojový cieľ a testovací hrdina, nebude hrateľný v MVP.
- **Hero archetypes (targeted roster beyond strict MVP):**
  - Cieľový stav po MVP / pri širšom launchi: aspoň 2 hrdinovia pre každý z archetypov **aggro**, **midrange**, **control**, **combo** (spolu približne 8 hrdinov).  
  - Okrem toho mať v príprave ďalších približne 3–4 hrdinov, aby bolo možné rýchlo rozširovať hru, ak sa chytí.
- Počet abilít na hrdinu: **TBD** (cieľ: dostatok na rôzne playstyle, ale stále „easy to learn“).  
- Základný set statusov: **TBD**, ale minimálne tie, ktoré tvoria jadro identity hrdinov (napr. burn, chi, evasive).  
- Úvodné UI flow:
  - Intro obrazovka / titulka.
  - Výber hrdinu a súpera.
  - Battle screen s jasnou čitateľnosťou: kocky, Spark, HP, statusy, combat log / cues.

### 7.1 Hero archetypes – intent

Tieto popisy sú pocitové „fantasy + playstyle“, nie hotové čísla:

- **Aggro**  
  - Hrá sa takmer bez obrany – aj v defense fáze vie „vracať úder“ cez reflect alebo podobné mechaniky.  
  - Musí mať zaujímavú ekonomiku/risky (napr. platenie HP, spotrebúvanie zdrojov), aby nešlo len o bezhlavé tlačenie damage do tváre.

- **Midrange**  
  - O niečo menej agresívny než čistý aggro; mieša solídny damage so statusmi, blokovaním a self-healom.  
  - Silno hrá okolo Sparku – kontrola a využívanie Sparku je jadrom jeho identity.

- **Control**  
  - Ťažko statusový archetyp – väčšinu času znepríjemňuje súperovi život (debuffy, zablokovanie možností, tempo).  
  - Hlavný damage prichádza cez „veľké“ hody a dlhšie prípravy, nie stabilný každokolo damage.

- **Combo**  
  - Buduje špecifický board state (symboly na kockách, statusy, tokeny), aby následne odpálil brutálnu abilitu.  
  - Vyžaduje trpezlivosť a plánovanie – BEZ správneho setupu pôsobí slabšie, ale keď mu karty (kocky) padnú, vie zničiť protivníka jedným highlight momentom.

## 8. UX & Presentation (Player experience)

- **Quick & readable:** UI je čisté, texty a ikony jasné aj na menších mobiloch, hráč vidí, čo sa deje s jeho kockami, HP, Spark a statusmi.  
- **Telegraphed moments:** dôležité momenty (ultimate, Spark swing, lethal attack) majú krátku, ale výraznú prezentáciu (overlay, highlight).  
- **Low friction:** minimum klikov medzi zápasmi – „play again“ flow, žiadne dlhé loady ani zbytočné obrazovky.  
- **Accessibility:** rešpektovať preferencie na menej animácií (reduced motion), dostatočný kontrast farieb, čitateľné fonty.

## 9. Telemetry & Success Metrics (MVP)

> Využívať existujúci stats/telemetry layer, nezbierať PII.

Príklady metrik, ktoré by mali byť sledované:

- Priemerná dĺžka zápasu (cieľ: 3–5 minút).  
- Winrate per hero vs. AI (aspoň hrubá balans informácia).  
- Počet odohratých zápasov na session (či funguje „ešte jeden zápas“ efekt).  
- Drop-off miesta (kde hráči typicky končia – tutorial, prvé zápasy, neskôr).  

Úspech MVP (pracovná definícia):

- Zápasy sú v cieľovom časovom okne a hráči typicky odohrajú viac ako jeden zápas po sebe.  
- Žiadna extrémne dominantná alebo bezmocná postava v základnom hero rostery.  
- Hráči reportujú, že Spark je „feel good“ mechanika, nie len RNG chaos.

## 10. Risks & Open Questions

- **Čitateľnosť vs. komplexita statusov:** existuje riziko, že bohatý status systém bude pre nového hráča neprehľadný.  
- **Spark tuning:** ak Spark bude príliš silný alebo príliš slabý, buď zničí pocit fairness, alebo stratí pointu.  
- **AI kvalita:** MVP sa spolieha na AI zápasy – slabá AI by mohla zabiť pocit „thrilling battle“.  
- **Meta-progress:** zatiaľ nie je jasné, aký hlboký meta-progress systém hra potrebuje (ranky, odomykanie, kozmetika).

Open questions (TBD):

- Koľko hrdinov naozaj stačí na MVP, aby hra pôsobila „fresh“?  
- Ako presne bude Spark prezentovaný v UI (bars, tokens, lane medzi hrdinami)?  
- Aký typ tutorialu je potrebný (plne skriptovaný zápas, krátky interaktívny onboarding, tooltips only)?  


Som autor hry dice-combat. Chcem, aby si mi OD ZÁKLADOV prerobil LAYOUT tak, aby bol:

- hrateľný na mobile (mobile-first),
- prehľadný a čitateľný aj na malom displeji,
- rozumne využiteľný aj na desktope (väčší, nie úplne iný).

DÔLEŽITÉ:

- NEŠAHAJ na game logiku, engine, combat, contexty, hooky a state.
- Sústreď sa LEN na layout / UI: komponent `BattleScreen` + súvisiace CSS/štýly.
- Nezavádzaj masívne refaktory, ktoré menia štruktúru projektu, iba UI vrstvu.

=====================================

1. # ANALÝZA

1. Pozri si:
   - `src/screens/BattleScreen.tsx`
   - CSS modul pre BattleScreen (napr. `BattleScreen.module.css`) – obsahuje triedy `.root, .main, .boardColumn, .boardWrap, .boardHalf, .playerBoardRow, .opponentBoardRow, .utilityColumn`, atď.
1. Stručne mi popíš (v komentári alebo poznámke):
   - čo je ABSOLÚTNE potrebné vidieť pri hre na mobile: HP oboch hrdinov, kocky / dice tray, tlačidlá (roll / confirm / end turn), základný combat log (aspoň pár posledných riadkov),
   - čo môže byť sekundárne / skryté na mobile (detailné štatistiky, rozšírený log, podrobné panely).

# ===================================== 2. MOBILE-FIRST VIRTUÁLNY BOARD + SCALE

Implementuj princíp „mobil je základ, väčšie displeje len zväčšujú“:

- Definuj konštanty (môžu byť v BattleScreen alebo separátne):

  ```ts
  const BOARD_WIDTH = 360;
  const BOARD_HEIGHT = 720;
  ```

  Board layout navrhni primárne pre mobil:

zhora nadol v jednom stĺpci:

súperov HUD (menší),

hlavná bojová zóna (dice tray + abilities),

môj HUD,

základný log (posledné riadky).

layout má byť čitateľný a ovládateľný na displeji okolo 360×720.

Vytvor hook na scale:
function useBoardScale() {
const [scale, setScale] = useState(1);

useLayoutEffect(() => {
function update() {
const vw = window.innerWidth;
const vh = window.innerHeight;

      const sx = vw / BOARD_WIDTH;
      const sy = vh / BOARD_HEIGHT;

      // mobile-first: na mobile scale >= 1 (base dizajn), na väčších obrazovkách môže byť väčší
      const s = Math.min(sx, sy);
      setScale(s < 1 ? 1 : s);
    }
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);

}, []);

return scale;
}

Vytvor wrapper komponent:
const GameBoardWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => {
const scale = useBoardScale();

return (

<div className={styles.boardScaleOuter}>
<div
className={styles.boardScaleInner}
style={{
          width: BOARD_WIDTH,
          height: BOARD_HEIGHT,
          transform: `scale(${scale})`,
          transformOrigin: "top left",
        }} >
{children}
</div>
</div>
);
};
V BattleScreen.tsx zabaľ aktuálny obsah boardu do GameBoardWrapper:

Nájdite blok, kde je boardWrap / boardContent / boardSplit.

Uprav to zhruba takto (prispôsob konkrétnemu JSX):

<div className={styles.boardColumn}>
  <GameBoardWrapper>
    <div className={styles.boardWrap}>
      {/* pôvodný boardContent / boardSplit / boardGrid, hero panely, dice, atď. */}
    </div>
  </GameBoardWrapper>
</div>

# =====================================

V CSS doplň:
.boardScaleOuter {
position: relative;
width: 100%;
height: 100%;
overflow: hidden;
}

.boardScaleInner {
position: relative;
}
===================================== 3. MOBILE LAYOUT – KONKRÉTNE PRAVIDLÁ

Základ (bez @media) má byť MOBILNÝ LAYOUT:

.main

default: flex-direction: column;

.boardColumn

full width, hore.

.utilityColumn

pod boardom, na celej šírke,

maximálne 1–2 panely viditeľné (napr. krátky log + settings / stats),

zvyšné veci schovaj do tabs / collapsible, NIE vedľa seba.

.playerBoardRow a .opponentBoardRow:

na mobile: žiadny 3-stĺpcový grid.

default urob takto:
.playerBoardRow,
.opponentBoardRow {
display: flex;
flex-direction: column;
align-items: stretch;
gap: 16px;
}
poradie (odporúčanie):

hero HUD (HP, statuses),

dice tray / abilities podľa potreby,

sekundárne veci.

Combat log:

na mobile ukáž len posledných ~5–8 riadkov, výšku obmedz scrollom,

ak už existuje detailnejší log, môže mať vlastnú obrazovku alebo overlay, ale nie musí byť stále viditeľný.

Interakcie:

tlačidlá (roll, confirm, end turn, defense voľby, atď.) musia mať:

min. výšku ~40–44px,

font-size aspoň 14–16px,

dostatočný padding.

===================================== 4. MEDIA QUERIES – TABLET & DESKTOP

Použi mobile-first:

Base = mobil (bez médií).

@media (min-width: 768px):

môžeš dať .main do dvoch stĺpcov: board + utilityColumn vedľa,

.playerBoardRow a .opponentBoardRow môžeš prepnúť na jednoduchý 2–3-stĺpcový grid (podobne ako dnes), ale bez toho, aby sa to rozpadalo na menších obrazovkách.

@media (min-width: 1100px):

môže zostať luxusnejší layout, ktorý dnešný CSS asi rieši (väčšie gaps, viac panelov naraz),

board je stále v GameBoardWrapper a len sa zväčší scale (takže základný mobilný layout ostáva rovnaký).

===================================== 5. OBMEDZENIA – ČO NESMIEŠ ROBIŤ

Nemeň:

game reducer / state,

combat engine,

GameController, useGameController, useGameData správanie,

štruktúru statusov, turn logiku, AI, atď.

Zmeny sú povolené v:

BattleScreen.tsx,

CSS module pre BattleScreen,

prípadne nový malý helper súbor pre GameBoardWrapper / useBoardScale.

Nezavádzaj nové CSS frameworky (Tailwind, atď.), zostaň pri existujúcom štýle (CSS modul).

===================================== 6. KONTROLA A REPORT

Po úpravách:

Spusť appku a manuálne skontroluj:

mobilný viewport (~375×812),

tablet (~768px),

desktop (>1200px).

Over:

vždy vidím HP oboch strán, kocky / dice tray, hlavné tlačidlá,

texty a čísla sú čitateľné bez zoomu,

žiadny horizontálny scroll na mobile.

Na záver mi prosím stručne popíš:

ktoré komponenty a CSS triedy si upravil,

ako vyzerá výsledný layout na mobile (hierarchia odhora dole),

ktoré časti sú ešte provizórne alebo by si vyžadovali ďalšiu iteráciu.

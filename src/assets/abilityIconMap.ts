import type { Combo, HeroId } from "../game/types";

type AbilityIconSources = {
  png?: string;
  webp?: string;
  slug?: string;
};

type AbilityIconVariants = {
  offense?: AbilityIconSources;
  defense?: AbilityIconSources;
};

type AbilityIconMutableMap = Record<
  HeroId,
  Partial<Record<Combo, AbilityIconVariants>>
>;

const HERO_ID_BY_FOLDER: Partial<Record<string, HeroId>> = {
  Pyromancer: "Pyromancer",
  ShadowMonk: "Shadow Monk",
  TrainingDummy: "Training Dummy",
};

const COMBO_BY_PREFIX: Record<string, Combo> = {
  "5OAK": "5OAK",
  "4OAK": "4OAK",
  "3OAK": "3OAK",
  FH: "FULL_HOUSE",
  LS: "LARGE_STRAIGHT",
  SS: "SMALL_STRAIGHT",
  "PAIR_PAIR": "PAIR_PAIR",
};

const COMBO_PREFIX_ENTRIES = Object.entries(COMBO_BY_PREFIX).sort(
  (a, b) => b[0].length - a[0].length
);

type AssetFormat = "png" | "webp";

const abilityIconMutableMap: AbilityIconMutableMap = {} as AbilityIconMutableMap;

const pngAssets = import.meta.glob<string>("./Abilities/*/*.png", {
  eager: true,
  import: "default",
});
const webpAssets = import.meta.glob<string>("./Abilities/*/*.webp", {
  eager: true,
  import: "default",
});

function ensureHeroEntry(heroId: HeroId) {
  if (!abilityIconMutableMap[heroId]) {
    abilityIconMutableMap[heroId] = {};
  }
  return abilityIconMutableMap[heroId]!;
}

function extractHeroId(pathSegments: string[]): HeroId | null {
  const folderSegment = pathSegments[pathSegments.length - 2];
  if (!folderSegment) return null;
  const base = folderSegment.replace(/_Abilities$/, "");
  const heroId = HERO_ID_BY_FOLDER[base];
  return heroId ?? null;
}

const toSlug = (value: string): string | null => {
  if (!value) return null;
  const slug = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
  return slug.length ? slug : null;
};

function extractComboMeta(filename: string): {
  combo: Combo | null;
  variant: "offense" | "defense";
  nameSlug: string | null;
} {
  const base = filename.replace(/\.[^.]+$/, "");
  let working = base;
  let variant: "offense" | "defense" = "offense";
  if (working.startsWith("DEF_")) {
    variant = "defense";
    working = working.slice(4);
  }

  const entry = COMBO_PREFIX_ENTRIES.find(([prefix]) => {
    return working === prefix || working.startsWith(`${prefix}_`);
  });

  if (!entry) {
    return { combo: null, variant, nameSlug: null };
  }

  const prefix = entry[0];
  let suffix: string | null = null;
  if (working.length > prefix.length + 1 && working[prefix.length] === "_") {
    suffix = working.slice(prefix.length + 1);
  }

  return {
    combo: entry[1],
    variant,
    nameSlug: suffix ? toSlug(suffix) : null,
  };
}

function assignAsset(
  heroId: HeroId,
  combo: Combo,
  variant: "offense" | "defense",
  asset: string,
  format: AssetFormat,
  nameSlug: string | null
) {
  const heroEntry = ensureHeroEntry(heroId);
  const variants = heroEntry[combo] ?? (heroEntry[combo] = {});
  const variantEntry = variants[variant] ?? (variants[variant] = {});

  if (format === "png") {
    variantEntry.png = asset;
  } else {
    variantEntry.webp = asset;
  }

  if (nameSlug && !variantEntry.slug) {
    variantEntry.slug = nameSlug;
  }
}

function processAssets(
  assets: Record<string, string>,
  format: AssetFormat
): void {
  for (const [path, asset] of Object.entries(assets)) {
    const segments = path.split("/");
    const heroId = extractHeroId(segments);
    if (!heroId) continue;

    const filename = segments[segments.length - 1] ?? "";
    const { combo, variant, nameSlug } = extractComboMeta(filename);
    if (!combo) continue;

    assignAsset(heroId, combo, variant, asset, format, nameSlug);
  }
}

processAssets(pngAssets, "png");
processAssets(webpAssets, "webp");

export const abilityIconMap: Record<
  HeroId,
  Partial<Record<Combo, AbilityIconVariants>>
> = abilityIconMutableMap;

export const getAbilityIcon = (
  heroId: HeroId,
  combo: Combo
): AbilityIconVariants | undefined => {
  return abilityIconMap[heroId]?.[combo];
};

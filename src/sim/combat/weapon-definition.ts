import type { AttackLibrary } from "./attack-definition";
import type { LocomotionState } from "../world/entity";

/**
 * A weapon names the ComboChain a loadout slot enters. It is not a subclass and
 * owns no behaviour: melee, projectile, movement, and launcher all stay
 * properties of the AttackDefinitions inside the chain it points at.
 */
export interface WeaponDefinition {
  readonly id: string;
  readonly entryChains: {
    readonly grounded: string | null;
    readonly airborne: string | null;
  };
}

export interface WeaponLibrary {
  readonly weapons: Readonly<Record<string, WeaponDefinition>>;
}

export function requireWeapon(
  library: WeaponLibrary,
  weaponId: string,
): WeaponDefinition {
  const weapon = library.weapons[weaponId];

  if (weapon === undefined) {
    throw new RangeError(`Weapon '${weaponId}' is not in the weapon library.`);
  }

  return weapon;
}

/** A downed fighter cannot attack, so it shares the grounded entry. */
export function weaponEntryChainId(
  weapon: WeaponDefinition,
  locomotion: LocomotionState,
): string | null {
  return locomotion === "airborne"
    ? weapon.entryChains.airborne
    : weapon.entryChains.grounded;
}

export function validateWeaponLibrary(
  weapons: WeaponLibrary,
  attacks: AttackLibrary,
): void {
  for (const [weaponId, weapon] of Object.entries(weapons.weapons)) {
    if (weapon.id !== weaponId) {
      throw new RangeError(
        `Weapon '${weaponId}' is filed under an id that does not match '${weapon.id}'.`,
      );
    }

    const entries = [weapon.entryChains.grounded, weapon.entryChains.airborne];
    if (entries.every((chainId) => chainId === null)) {
      throw new RangeError(`Weapon '${weaponId}' needs at least one entry chain.`);
    }

    for (const chainId of entries) {
      if (chainId !== null && attacks.chains[chainId] === undefined) {
        throw new RangeError(
          `Weapon '${weaponId}' points at attack chain '${chainId}', which is not in the attack library.`,
        );
      }
    }
  }
}

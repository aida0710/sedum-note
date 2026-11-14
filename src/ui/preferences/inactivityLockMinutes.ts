// 操作が無いときに自動でロックするまでの時間（分）の決まり。設定の画面の選択肢と、時間を指定するときの範囲と単位。

// 選んで決められる時間（分）。15 分、45 分、1・3・6・12・24 時間。
export const INACTIVITY_LOCK_PRESET_MINUTES = [15, 45, 60, 180, 360, 720, 1440] as const;

// 時間を指定するときに入れられる範囲（分）。1 分から 7 日。
export const INACTIVITY_LOCK_MINUTES_RANGE = { minimum: 1, maximum: 7 * 24 * 60 } as const;

export const INACTIVITY_LOCK_UNITS = ["minutes", "hours"] as const;
export type InactivityLockUnit = (typeof INACTIVITY_LOCK_UNITS)[number];

const MINUTES_PER_UNIT: Record<InactivityLockUnit, number> = { minutes: 1, hours: 60 };

export function isInactivityLockMinutes(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) &&
    value >= INACTIVITY_LOCK_MINUTES_RANGE.minimum && value <= INACTIVITY_LOCK_MINUTES_RANGE.maximum;
}

export function isPresetInactivityLockMinutes(minutes: number): boolean {
  return (INACTIVITY_LOCK_PRESET_MINUTES as readonly number[]).includes(minutes);
}

export type InactivityLockAmount = { amount: number; unit: InactivityLockUnit };

// 時間を、数と単位にする。時間で割り切れれば時間、そうでなければ分。
export function inactivityLockAmountOf(minutes: number): InactivityLockAmount {
  return minutes % MINUTES_PER_UNIT.hours === 0 ? { amount: minutes / MINUTES_PER_UNIT.hours, unit: "hours" } : { amount: minutes, unit: "minutes" };
}

export type InactivityLockInput = { minutes: number } | { invalid: "notWholeNumber" | "outOfRange" };

// 入れた数と単位を、分にする。整数でない（空も含む）・範囲の外なら、その理由を返す。
export function parseInactivityLockInput(amountText: string, unit: InactivityLockUnit): InactivityLockInput {
  const amount = Number(amountText.trim());
  if (amountText.trim() === "" || !Number.isInteger(amount)) {
    return { invalid: "notWholeNumber" };
  }
  const minutes = amount * MINUTES_PER_UNIT[unit];
  return isInactivityLockMinutes(minutes) ? { minutes } : { invalid: "outOfRange" };
}

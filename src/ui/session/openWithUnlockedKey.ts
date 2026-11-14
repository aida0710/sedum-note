// パスフレーズを聞かずに、もう開いてあるキー（このウィンドウで前に解除したもの、ほかのウィンドウが渡したもの）で手元の vault を開く。
// キーを待つ間・開く間に、どこかでロックしたら、開いたものを捨てる（ロックの合図とキーの返事は、届く順が決まっていない）。

import { reopenLocalVaultWithKeyOf, type UnlockedVault, type VaultKey, type VaultSessionEnvironment } from "../../core/vault/vaultSession";
import { lockCountOfThisWindow } from "./unlockedSpaces";

// findKey が返したキーで開く。キーが無い・手元の vault のキーでない・開けない・待つ間にロックしたときは null（パスフレーズを聞く）。
export async function openWithUnlockedKey(environment: VaultSessionEnvironment, findKey: () => Promise<VaultKey | null>): Promise<UnlockedVault | null> {
  const locksBefore = lockCountOfThisWindow();
  const key = await findKey();
  if (key === null || lockCountOfThisWindow() !== locksBefore) {
    return null;
  }
  let opened: UnlockedVault;
  try {
    opened = await reopenLocalVaultWithKeyOf(environment, key);
  } catch {
    // 開けない理由（別の vault のキー、このアプリより新しいデータの形）は、パスフレーズで解除するときに画面へ出る。
    return null;
  }
  if (lockCountOfThisWindow() !== locksBefore) {
    opened.repository.release();
    return null;
  }
  return opened;
}

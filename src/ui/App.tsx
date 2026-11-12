// 画面の入口。vault の状態で、初回の設定・ロック解除・メモの画面を出し分ける。

import { lazy, Suspense, useEffect, useState } from "react";
import { languageInUse } from "./i18n/languageInUse";
import { translate } from "./i18n/translate";
import { useDevicePreferences } from "./preferences/devicePreferences";
import { useLaunchRequests } from "./share/useLaunchRequests";
import { isRunningInTauri } from "./platform/runtime";
import { applyAppearance } from "./theme/applyAppearance";
import { useThemeInUse } from "./theme/themeInUse";
import { AvailableUpdateContext, useAvailableUpdate } from "./update/useAvailableUpdate";
import { SetupScreen } from "./entry/SetupScreen";
import { UnlockScreen } from "./entry/UnlockScreen";
import { DialogProvider } from "./shared/DialogProvider";
import { ToastProvider } from "./shared/ToastProvider";
import { GeneratedSyncKeyDialog } from "./sync/GeneratedSyncKeyDialog";
import { AttachmentReaderContext } from "./editor/attachmentReader";
import { MobileWorkspace } from "./mobile/MobileWorkspace";
import { UnsyncedRecordsContext, useRepositorySnapshot } from "./session/useRepositorySnapshot";
import { useTrashRetention } from "./session/useTrashRetention";
import { useDueReminders } from "./session/useDueReminders";
import { applyResidentAppSetting } from "./platform/residentApp";
import { canStayResident } from "./platform/runtime";
import { noteIdOfThisWindow, setWindowTitle, spaceIdOfThisWindow } from "./platform/noteWindows";
import { useSpaceRegistry } from "./session/spaceRegistry";
import { NoteLockStateContext, useSnapshotWithLocks } from "./session/noteLockState";
import { PassphraseConfirmProvider } from "./session/PassphraseConfirmProvider";
import { useVaultSession, type VaultSession } from "./session/useVaultSession";
import { MOBILE_LAYOUT_QUERY, useMediaQuery } from "./shared/useMediaQuery";
import { DesktopWorkspace } from "./workspace/DesktopWorkspace";
import { useWorkspaceNavigation } from "./workspace/useWorkspaceNavigation";
import type { UnlockedVault } from "../core/vault/vaultSession";
import { applyCustomCss } from "./theme/customCss";
import { AiSettingsContext, useAiSettingsOfVault } from "./ai/aiSettingsAccess";
import { AiChatSessionProvider } from "./ai/aiChatSession";

// MCP は PC 版（デスクトップのアプリ）にだけ同梱する。__INCLUDES_MCP__ はビルドのときに決まる定数なので、
// Web 版と Android のアプリのビルドでは、この読み込みごと取り除かれ、MCP のコードはファイルに入らない。
// 開発サーバーは PC 版として組み立てるが、ブラウザで開いたときは窓口が無いので読み込まない。
const McpGatewayProvider = __INCLUDES_MCP__ && isRunningInTauri() ? lazy(() => import("./mcp/McpGatewayProvider")) : null;

export function App() {
  // 開くスペース。メモを 1 つだけ開く別のウィンドウは、開いたときのスペースのまま（ほかのウィンドウで切り替えても変わらない）。
  const { activeSpaceId } = useSpaceRegistry();
  const [windowSpaceId] = useState(spaceIdOfThisWindow);
  const spaceId = windowSpaceId ?? activeSpaceId;
  // 言語を変えたら、ここから下を描き直して文言を入れ替える。
  const { language, editorFontSize, sidebarWidth, stayResident } = useDevicePreferences();
  // 常駐の設定は、ロックを解除する前から効かせる（言語を変えたら、アイコンのメニューの文言も入れ替える）。
  useEffect(() => {
    if (canStayResident()) {
      void applyResidentAppSetting({ enabled: stayResident, showLabel: translate("reminders.trayShow"), quitLabel: translate("reminders.trayQuit") });
    }
  }, [stayResident, language]);
  useEffect(() => {
    document.documentElement.lang = languageInUse();
  }, [language]);
  const theme = useThemeInUse();
  useEffect(() => applyAppearance({ theme, editorFontSize, sidebarWidth }), [theme, editorFontSize, sidebarWidth]);
  // スペースを切り替えたら、そのスペースの画面を最初から作り直す（前のスペースのメモを、メモリから手放す）。
  return <DialogProvider><SpaceScreen key={spaceId} spaceId={spaceId} /></DialogProvider>;
}

function SpaceScreen({ spaceId }: { spaceId: string }) {
  const session = useVaultSession(spaceId);
  // 知らせは、画面の段階（ロック中・解除中など）が変わったら捨てる。ロックの直前に出た「元に戻す」をロックの画面に残すと、
  // ロックで手放したメモの入れ物（復号した本文とマスターキー）を使って書き込めてしまう。
  return <ToastProvider key={session.state.phase}><ScreenForPhase session={session} spaceId={spaceId} /></ToastProvider>;
}

function ScreenForPhase({ session, spaceId }: { session: VaultSession; spaceId: string }) {
  switch (session.state.phase) {
    case "loading":
      return null;
    case "absent":
      return <SetupScreen session={session} spaceId={spaceId} />;
    case "locked":
      return <UnlockScreen session={session} spaceId={spaceId} />;
    case "unlocked":
      return <UnlockedApp key={session.state.vault.syncEngine ? "synced" : "local"} session={session} vault={session.state.vault} />;
  }
}

// 同期を設定していなければ、未送信の印は出さない（送る先が無い）。
const NO_UNSYNCED_RECORDS: ReadonlySet<string> = new Set();

function UnlockedApp({ session, vault }: { session: VaultSession; vault: UnlockedVault }) {
  const repositorySnapshot = useRepositorySnapshot(vault.repository);
  const { customCss, customCssEnabled } = useDevicePreferences();
  // カスタム CSS は、ロックを解除している間だけ当てる（ロックしたら外す）。
  useEffect(() => {
    applyCustomCss(customCssEnabled ? customCss : "");
    return () => applyCustomCss("");
  }, [customCss, customCssEnabled]);
  // メモを 1 つだけ開く別のウィンドウなら、そのメモの ID。ウィンドウを開いたときに決まり、あとから変わらない。
  const [windowNoteId] = useState(noteIdOfThisWindow);
  const isNoteWindow = windowNoteId !== null;
  const navigation = useWorkspaceNavigation(windowNoteId);
  const { snapshot, lockState } = useSnapshotWithLocks(repositorySnapshot, navigation.revealedNoteIds);
  useDueReminders({ enabled: !isNoteWindow, summaries: repositorySnapshot.summaries, lockedNoteIds: lockState.lockedNoteIds });
  // 別のウィンドウの名前は、開いているメモの題にする。
  const windowNoteTitle = windowNoteId === null ? null : vault.repository.note(navigation.activeTab ?? windowNoteId)?.content.title ?? null;
  useEffect(() => {
    if (isNoteWindow) {
      void setWindowTitle(windowNoteTitle || translate("sidebar.untitled"));
    }
  }, [isNoteWindow, windowNoteTitle]);
  const isMobile = useMediaQuery(MOBILE_LAYOUT_QUERY);
  useLaunchRequests(vault.repository, navigation.openNote);
  const availableUpdate = useAvailableUpdate();
  useTrashRetention(vault, session.syncStatus);
  const aiSettings = useAiSettingsOfVault(vault);
  const props = { session, vault, snapshot, navigation, isNoteWindow };
  const workspace = (
    <>
      {isMobile ? <MobileWorkspace {...props} /> : <DesktopWorkspace {...props} />}
      {session.generatedSyncKey !== null && <GeneratedSyncKeyDialog syncKey={session.generatedSyncKey} onClose={session.dismissGeneratedSyncKey} />}
    </>
  );
  return (
    <AttachmentReaderContext.Provider value={vault.repository.readAttachment.bind(vault.repository)}>
      <UnsyncedRecordsContext.Provider value={vault.syncEngine ? snapshot.unsyncedIds : NO_UNSYNCED_RECORDS}>
        <AvailableUpdateContext.Provider value={availableUpdate}>
          <AiSettingsContext.Provider value={aiSettings}>
          <AiChatSessionProvider>
          <NoteLockStateContext.Provider value={lockState}>
          <PassphraseConfirmProvider verifyPassphrase={session.verifyPassphrase}>
          {/* MCP の窓口は、最初のウィンドウだけが開く（別のウィンドウが同じポートを取り合わない）。 */}
          {McpGatewayProvider && !isNoteWindow
            ? <Suspense fallback={null}><McpGatewayProvider vault={vault}>{workspace}</McpGatewayProvider></Suspense>
            : workspace}
          </PassphraseConfirmProvider>
          </NoteLockStateContext.Provider>
          </AiChatSessionProvider>
          </AiSettingsContext.Provider>
        </AvailableUpdateContext.Provider>
      </UnsyncedRecordsContext.Provider>
    </AttachmentReaderContext.Provider>
  );
}

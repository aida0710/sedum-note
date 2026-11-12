// アプリの中での録音。マイクの音を録って、止めたときに音声のファイルとして渡す（渡した先で、メモに添付する）。

import { useEffect, useRef, useState } from "react";
import { translate } from "../i18n/translate";
import { UserFacingError } from "../i18n/userFacingError";
import { useAsyncAction } from "../shared/useAsyncAction";

export type AudioRecorder = {
  recording: boolean;
  // 録音を始める。録音中に呼ぶと、止めてファイルを渡す。
  toggle: () => void;
  errorMessage: string | null;
};

// マイクと録音の機能があるか。無い環境（Linux のアプリの WebKitGTK など）では、録音のボタンを出さない。
export function isAudioRecordingAvailable(): boolean {
  return typeof MediaRecorder !== "undefined" && typeof navigator.mediaDevices?.getUserMedia === "function";
}

// 録音の形式の拡張子。ブラウザごとに録れる形式が違う（Chromium は WebM、WebKit は MP4）。
function audioFileExtension(mimeType: string): string {
  return mimeType.includes("mp4") ? "m4a" : mimeType.includes("ogg") ? "ogg" : "webm";
}

// 例: 録音 2026-11-12 15.04.webm（ファイル名に使えない「:」を避ける）。
function recordingFileName(startedAt: Date, mimeType: string): string {
  const twoDigits = (value: number) => String(value).padStart(2, "0");
  const date = `${startedAt.getFullYear()}-${twoDigits(startedAt.getMonth() + 1)}-${twoDigits(startedAt.getDate())}`;
  const time = `${twoDigits(startedAt.getHours())}.${twoDigits(startedAt.getMinutes())}`;
  return `${translate("editor.recordingFileName")} ${date} ${time}.${audioFileExtension(mimeType)}`;
}

export function useAudioRecorder(onRecorded: (file: File) => void): AudioRecorder {
  const [recording, setRecording] = useState(false);
  const recorder = useRef<MediaRecorder | null>(null);
  // 画面を離れたら、マイクを放す（録りかけの音は捨てる）。
  useEffect(() => () => {
    recorder.current?.stream.getTracks().forEach((track) => track.stop());
  }, []);

  const start = useAsyncAction(async () => {
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      throw new UserFacingError(translate("editor.recordingDenied"));
    }
    const startedAt = new Date();
    const chunks: Blob[] = [];
    const mediaRecorder = new MediaRecorder(stream);
    mediaRecorder.addEventListener("dataavailable", (event) => chunks.push(event.data));
    mediaRecorder.addEventListener("stop", () => {
      stream.getTracks().forEach((track) => track.stop());
      recorder.current = null;
      setRecording(false);
      const mimeType = mediaRecorder.mimeType || chunks[0]?.type || "audio/webm";
      // 形式の細かい指定（;codecs=opus など）は、添付の種類には入れない。
      const baseMimeType = mimeType.split(";")[0] ?? mimeType;
      onRecorded(new File(chunks, recordingFileName(startedAt, baseMimeType), { type: baseMimeType }));
    });
    mediaRecorder.start();
    recorder.current = mediaRecorder;
    setRecording(true);
  });

  return {
    recording,
    toggle: () => (recorder.current ? recorder.current.stop() : void start.run(undefined)),
    errorMessage: start.errorMessage,
  };
}

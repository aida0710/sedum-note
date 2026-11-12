// ドラッグしている間、指（マウス）の下に出す札。何を持っているかが分かるように、名前を書いた小さな札にする。

// ブラウザは setDragImage を呼んだときの見た目を写し取るので、札はすぐ消してよい。写し取る前に消さないよう、次の描画まで待つ。
export function showDragPreview(event: React.DragEvent, label: string): void {
  const preview = document.createElement("div");
  preview.className = "drag-preview";
  preview.textContent = label;
  document.body.append(preview);
  // 札の左上から少し内側を、指の位置にする（札が指で隠れないように）。
  event.dataTransfer.setDragImage(preview, -8, -8);
  requestAnimationFrame(() => preview.remove());
}

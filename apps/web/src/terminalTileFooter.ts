export type TerminalTileComposerKeyEvent = {
  key: string;
  shiftKey: boolean;
  nativeEvent?: {
    isComposing?: boolean;
  };
  stopPropagation: () => void;
  preventDefault: () => void;
};

export type TerminalTileMouseEvent = {
  stopPropagation: () => void;
};

export function stopTerminalTileFooterMouseDown(event: TerminalTileMouseEvent) {
  event.stopPropagation();
}

export function shouldSubmitTerminalTileComposer(event: TerminalTileComposerKeyEvent) {
  event.stopPropagation();
  if (event.key !== "Enter") return false;
  if (event.nativeEvent?.isComposing) return false;
  if (event.shiftKey) return false;

  event.preventDefault();
  return true;
}

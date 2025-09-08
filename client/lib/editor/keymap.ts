import type React from "react";
import type { ToolbarScriptElementType } from "@/lib/helpers/screenplay-config";

export interface KeymapHandlers {
  handleFinalizeUpdate: (id: string, content: string, isScene: boolean) => void;
  handleInsertElement: (type: ToolbarScriptElementType, targetElementId?: string, isTargetScene?: boolean) => void;
  handleDeleteScene: (sceneId: string) => void;
  handleDeleteElement: (elementId: string) => void;
  handleSelectAll: (e: React.KeyboardEvent<HTMLDivElement>) => void;
}

export const getKeyString = (e: React.KeyboardEvent): string => {
  let key = e.key.toLowerCase();
  if (e.ctrlKey) key = `ctrl+${key}`;
  if (e.shiftKey) key = `shift+${key}`;
  if (e.altKey) key = `alt+${key}`;
  if (e.metaKey) key = `meta+${key}`;
  return key;
};

export const createKeymap = (handlers: KeymapHandlers) => ({
  "enter": (
    e: React.KeyboardEvent<HTMLDivElement>,
    elementId: string,
    isScene: boolean,
    elementType: ToolbarScriptElementType | "SCENE_HEADING"
  ) => {
    e.preventDefault();
    handlers.handleFinalizeUpdate(elementId, e.currentTarget.innerHTML, isScene);

    if (isScene) {
      handlers.handleInsertElement("ACTION", elementId, true);
    } else {
      const currentElementType = elementType as ToolbarScriptElementType;
      let nextElementType: ToolbarScriptElementType | null = null;
      switch (currentElementType) {
        case "ACTION": nextElementType = "ACTION"; break;
        case "CHARACTER": nextElementType = "DIALOG"; break;
        case "DIALOG": nextElementType = "ACTION"; break;
        case "PARENTHETICAL": nextElementType = "DIALOG"; break;
        case "TRANSITION": nextElementType = "ACTION"; break;
        case "SHOT": nextElementType = "ACTION"; break;
      }
      if (nextElementType) {
        handlers.handleInsertElement(nextElementType, elementId, false);
      }
    }
  },
  "backspace": (
    e: React.KeyboardEvent<HTMLDivElement>,
    elementId: string,
    isScene: boolean
  ) => {
    const content = e.currentTarget.innerHTML;
    if (content === "" || content === "<br>") {
      e.preventDefault();
      if (isScene) {
        handlers.handleDeleteScene(elementId);
      } else {
        handlers.handleDeleteElement(elementId);
      }
    }
  },
  "ctrl+a": (e: React.KeyboardEvent<HTMLDivElement>) => {
    handlers.handleSelectAll(e);
  },
});

import type React from "react";
import type { ToolbarScriptElementType } from "@/lib/helpers/screenplay-config";

export interface KeymapHandlers {
  handleFinalizeUpdate: (id: string, content: string, isScene: boolean) => void;
  handleInsertElement: (type: ToolbarScriptElementType, targetElementId?: string, isTargetScene?: boolean) => void;
  handleDeleteScene: (sceneId: string) => void;
  handleDeleteElement: (elementId: string) => void;
  handleSelectAll: (e: React.KeyboardEvent<HTMLDivElement>) => void;
  handleChangeElementType: (elementId: string, newType: ToolbarScriptElementType, currentContent: string) => void;
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

    // Contextual Workflow Logic for Enter key
    if (isScene) {
      // From Scene Heading → Action
      handlers.handleInsertElement("ACTION", elementId, true);
    } else {
      const currentElementType = elementType as ToolbarScriptElementType;
      let nextElementType: ToolbarScriptElementType | null = null;
      switch (currentElementType) {
        case "ACTION":
          // From Action → Action
          nextElementType = "ACTION";
          break;
        case "CHARACTER":
          // From Character → Dialogue
          nextElementType = "DIALOG";
          break;
        case "DIALOG":
          // From Dialogue → Action
          nextElementType = "ACTION";
          break;
        case "PARENTHETICAL":
          // From Parenthetical → Dialogue
          nextElementType = "DIALOG";
          break;
        case "TRANSITION":
          nextElementType = "ACTION";
          break;
        case "SHOT":
          nextElementType = "ACTION";
          break;
      }
      if (nextElementType) {
        handlers.handleInsertElement(nextElementType, elementId, false);
      }
    }
  },
  "tab": (
    e: React.KeyboardEvent<HTMLDivElement>,
    elementId: string,
    isScene: boolean,
    elementType: ToolbarScriptElementType | "SCENE_HEADING"
  ) => {
    e.preventDefault();
    
    // Contextual Workflow Logic for Tab key
    if (isScene) return; // Don't transform scene headings with Tab
    
    const currentElementType = elementType as ToolbarScriptElementType;
    let newElementType: ToolbarScriptElementType | null = null;
    
    switch (currentElementType) {
      case "ACTION":
        // From Action → Create new Character element
        newElementType = "CHARACTER";
        break;
      case "DIALOG":
        // From Dialogue → Create new Parenthetical element
        newElementType = "PARENTHETICAL";
        break;
      // Other element types don't transform on Tab
    }
    
    if (newElementType) {
      // Finalize the current element first
      handlers.handleFinalizeUpdate(elementId, e.currentTarget.innerHTML, isScene);
      // Create new element of the next type
      handlers.handleInsertElement(newElementType, elementId, false);
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
  // Core Mapping for Element Transformation (Cmd/Ctrl + 1-7)
  "ctrl+1": (
    e: React.KeyboardEvent<HTMLDivElement>,
    elementId: string,
    isScene: boolean
  ) => {
    e.preventDefault();
    if (!isScene) {
      const currentContent = e.currentTarget.textContent || "";
      handlers.handleChangeElementType(elementId, "SHOT", currentContent);
    }
  },
  "meta+1": (
    e: React.KeyboardEvent<HTMLDivElement>,
    elementId: string,
    isScene: boolean
  ) => {
    e.preventDefault();
    if (!isScene) {
      const currentContent = e.currentTarget.textContent || "";
      handlers.handleChangeElementType(elementId, "SHOT", currentContent);
    }
  },
  "ctrl+2": (
    e: React.KeyboardEvent<HTMLDivElement>,
    elementId: string,
    isScene: boolean
  ) => {
    e.preventDefault();
    if (!isScene) {
      const currentContent = e.currentTarget.textContent || "";
      handlers.handleChangeElementType(elementId, "ACTION", currentContent);
    }
  },
  "meta+2": (
    e: React.KeyboardEvent<HTMLDivElement>,
    elementId: string,
    isScene: boolean
  ) => {
    e.preventDefault();
    if (!isScene) {
      const currentContent = e.currentTarget.textContent || "";
      handlers.handleChangeElementType(elementId, "ACTION", currentContent);
    }
  },
  "ctrl+3": (
    e: React.KeyboardEvent<HTMLDivElement>,
    elementId: string,
    isScene: boolean
  ) => {
    e.preventDefault();
    if (!isScene) {
      const currentContent = e.currentTarget.textContent || "";
      handlers.handleChangeElementType(elementId, "CHARACTER", currentContent);
    }
  },
  "meta+3": (
    e: React.KeyboardEvent<HTMLDivElement>,
    elementId: string,
    isScene: boolean
  ) => {
    e.preventDefault();
    if (!isScene) {
      const currentContent = e.currentTarget.textContent || "";
      handlers.handleChangeElementType(elementId, "CHARACTER", currentContent);
    }
  },
  "ctrl+4": (
    e: React.KeyboardEvent<HTMLDivElement>,
    elementId: string,
    isScene: boolean
  ) => {
    e.preventDefault();
    if (!isScene) {
      const currentContent = e.currentTarget.textContent || "";
      handlers.handleChangeElementType(elementId, "PARENTHETICAL", currentContent);
    }
  },
  "meta+4": (
    e: React.KeyboardEvent<HTMLDivElement>,
    elementId: string,
    isScene: boolean
  ) => {
    e.preventDefault();
    if (!isScene) {
      const currentContent = e.currentTarget.textContent || "";
      handlers.handleChangeElementType(elementId, "PARENTHETICAL", currentContent);
    }
  },
  "ctrl+5": (
    e: React.KeyboardEvent<HTMLDivElement>,
    elementId: string,
    isScene: boolean
  ) => {
    e.preventDefault();
    if (!isScene) {
      const currentContent = e.currentTarget.textContent || "";
      handlers.handleChangeElementType(elementId, "DIALOG", currentContent);
    }
  },
  "meta+5": (
    e: React.KeyboardEvent<HTMLDivElement>,
    elementId: string,
    isScene: boolean
  ) => {
    e.preventDefault();
    if (!isScene) {
      const currentContent = e.currentTarget.textContent || "";
      handlers.handleChangeElementType(elementId, "DIALOG", currentContent);
    }
  },
  "ctrl+6": (
    e: React.KeyboardEvent<HTMLDivElement>,
    elementId: string,
    isScene: boolean
  ) => {
    e.preventDefault();
    if (!isScene) {
      const currentContent = e.currentTarget.textContent || "";
      handlers.handleChangeElementType(elementId, "TRANSITION", currentContent);
    }
  },
  "meta+6": (
    e: React.KeyboardEvent<HTMLDivElement>,
    elementId: string,
    isScene: boolean
  ) => {
    e.preventDefault();
    if (!isScene) {
      const currentContent = e.currentTarget.textContent || "";
      handlers.handleChangeElementType(elementId, "TRANSITION", currentContent);
    }
  },
  "ctrl+7": (
    e: React.KeyboardEvent<HTMLDivElement>,
    elementId: string,
    isScene: boolean
  ) => {
    e.preventDefault();
    if (!isScene) {
      const currentContent = e.currentTarget.textContent || "";
      handlers.handleChangeElementType(elementId, "SHOT", currentContent);
    }
  },
  "meta+7": (
    e: React.KeyboardEvent<HTMLDivElement>,
    elementId: string,
    isScene: boolean
  ) => {
    e.preventDefault();
    if (!isScene) {
      const currentContent = e.currentTarget.textContent || "";
      handlers.handleChangeElementType(elementId, "SHOT", currentContent);
    }
  },
});

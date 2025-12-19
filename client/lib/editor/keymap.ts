import type React from "react";
import type { ToolbarScriptElementType } from "@/lib/helpers/screenplay-config";

export interface KeymapHandlers {
  handleFinalizeUpdate: (id: string, content: string, isScene: boolean) => void;
  handleInsertElement: (type: ToolbarScriptElementType, targetElementId?: string, isTargetScene?: boolean) => void;
  handleDeleteScene: (sceneId: string) => void;
  handleDeleteElement: (elementId: string) => void;
  handleSelectAll: (e: React.KeyboardEvent<HTMLDivElement>) => void;
  handleChangeElementType: (elementId: string, newType: ToolbarScriptElementType, currentContent: string) => void;
  handleNavigateToPrevious?: (elementId: string) => void;
  handleNavigateToNext?: (elementId: string) => void;
  handleAddNewScene?: () => void;
}

// Track last Enter press for double-Enter detection
let lastEnterTime = 0;
let pendingEnterTimeout: ReturnType<typeof setTimeout> | null = null;
const DOUBLE_ENTER_THRESHOLD = 300; // ms

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
    
    const now = Date.now();
    const isDoubleEnter = (now - lastEnterTime) < DOUBLE_ENTER_THRESHOLD;
    lastEnterTime = now;
    
    // Double-Enter creates a new scene - cancel pending action
    if (isDoubleEnter && handlers.handleAddNewScene) {
      if (pendingEnterTimeout) {
        clearTimeout(pendingEnterTimeout);
        pendingEnterTimeout = null;
      }
      handlers.handleAddNewScene();
      return;
    }
    
    // Store current content for the delayed action
    const currentContent = e.currentTarget.innerHTML;
    
    // Delay the normal Enter action to see if a second Enter is coming
    if (pendingEnterTimeout) {
      clearTimeout(pendingEnterTimeout);
    }
    
    pendingEnterTimeout = setTimeout(() => {
      pendingEnterTimeout = null;
      
      handlers.handleFinalizeUpdate(elementId, currentContent, isScene);

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
          // New element types
          case "TEXT":
            nextElementType = "TEXT";
            break;
          case "NOTE":
            nextElementType = "ACTION";
            break;
          case "OUTLINE":
            nextElementType = "ACTION";
            break;
          case "NEW_ACT":
            nextElementType = "ACTION";
            break;
          case "END_ACT":
            nextElementType = "ACTION";
            break;
          case "LYRICS":
            nextElementType = "LYRICS";
            break;
          case "SEQUENCE":
            nextElementType = "ACTION";
            break;
          case "DUAL_DIALOG":
            nextElementType = "DUAL_DIALOG";
            break;
        }
        if (nextElementType) {
          handlers.handleInsertElement(nextElementType, elementId, false);
        }
      }
    }, DOUBLE_ENTER_THRESHOLD);
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
  "arrowup": (
    e: React.KeyboardEvent<HTMLDivElement>,
    elementId: string
  ) => {
    // Check if cursor is at the beginning of the element
    const selection = window.getSelection();
    if (selection && selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);
      const element = e.currentTarget;
      
      // If cursor is at the start (offset 0 in first node or first child)
      const isAtStart = range.startOffset === 0 && 
        (range.startContainer === element || 
         range.startContainer === element.firstChild ||
         (element.textContent?.length === 0));
      
      if (isAtStart && handlers.handleNavigateToPrevious) {
        e.preventDefault();
        handlers.handleNavigateToPrevious(elementId);
      }
    }
  },
  "arrowdown": (
    e: React.KeyboardEvent<HTMLDivElement>,
    elementId: string
  ) => {
    // Check if cursor is at the end of the element
    const selection = window.getSelection();
    if (selection && selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);
      const element = e.currentTarget;
      const textLength = element.textContent?.length || 0;
      
      // If cursor is at the end
      const isAtEnd = range.collapsed && 
        (range.endOffset === textLength ||
         range.endContainer === element.lastChild && 
         range.endOffset === (range.endContainer.textContent?.length || 0) ||
         textLength === 0);
      
      if (isAtEnd && handlers.handleNavigateToNext) {
        e.preventDefault();
        handlers.handleNavigateToNext(elementId);
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

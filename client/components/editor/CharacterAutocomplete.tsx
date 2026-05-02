"use client"

import React, { useState, useEffect, useRef, useCallback } from "react"
import { cn } from "@/lib/utils"
import { User } from "lucide-react"
import type { Scene } from "@/services/project"

// Extensions to strip from character names for normalization
const CHARACTER_EXTENSIONS = [
  "(V.O.)",
  "(O.S.)",
  "(O.C.)",
  "(CONT'D)",
  "(CONT)",
  "(PRE-LAP)",
  "(PRELAP)",
  "(FILTER)",
  "(SUBTITLE)",
]

interface CharacterInfo {
  name: string
  frequency: number
  lastSceneIndex: number
  lastElementIndex: number
  isNearby: boolean // In current or adjacent scene
}

interface CharacterAutocompleteProps {
  elementRef: React.RefObject<HTMLDivElement | null>
  isActive: boolean
  onSuggestionSelect: (suggestion: string) => void
  scenes: Scene[]
  currentSceneId: string
}

/**
 * Normalize a character name by:
 * - Converting to uppercase
 * - Trimming whitespace
 * - Removing extensions like (V.O.), (O.S.), etc.
 */
function normalizeCharacterName(name: string): string {
  let normalized = name.trim().toUpperCase()

  // Remove known extensions
  for (const ext of CHARACTER_EXTENSIONS) {
    normalized = normalized.replace(ext, "").trim()
  }

  // Remove any remaining parenthetical at the end
  normalized = normalized.replace(/\s*\([^)]*\)\s*$/, "").trim()

  return normalized
}

/**
 * Extract all character names from the script with frequency and recency info
 */
function extractCharacters(scenes: Scene[], currentSceneId: string): CharacterInfo[] {
  const characterMap = new Map<string, CharacterInfo>()
  const currentSceneIndex = scenes.findIndex(s => s.id === currentSceneId)

  scenes.forEach((scene, sceneIndex) => {
    if (!scene.elements) return

    scene.elements.forEach((element, elementIndex) => {
      if (element.element_type === "CHARACTER") {
        const normalizedName = normalizeCharacterName(element.content)

        if (normalizedName.length === 0) return

        const isNearby = Math.abs(sceneIndex - currentSceneIndex) <= 1

        const existing = characterMap.get(normalizedName)
        if (existing) {
          existing.frequency += 1
          existing.isNearby = existing.isNearby || isNearby
          // Update recency if this occurrence is later
          if (sceneIndex > existing.lastSceneIndex ||
            (sceneIndex === existing.lastSceneIndex && elementIndex > existing.lastElementIndex)) {
            existing.lastSceneIndex = sceneIndex
            existing.lastElementIndex = elementIndex
          }
        } else {
          characterMap.set(normalizedName, {
            name: normalizedName,
            frequency: 1,
            lastSceneIndex: sceneIndex,
            lastElementIndex: elementIndex,
            isNearby,
          })
        }
      }
    })
  })

  return Array.from(characterMap.values())
}

/**
 * Rank characters by:
 * 1. Proximity to current scene (characters in current/nearby scenes ranked higher)
 * 2. Frequency of appearance
 * 3. Recency of use
 */
function rankCharacters(
  characters: CharacterInfo[],
  currentSceneIndex: number
): CharacterInfo[] {
  return characters.sort((a, b) => {
    // Calculate proximity score (lower distance = higher score)
    const distanceA = Math.abs(a.lastSceneIndex - currentSceneIndex)
    const distanceB = Math.abs(b.lastSceneIndex - currentSceneIndex)

    // Proximity is most important - characters in same or adjacent scenes first
    if (distanceA <= 1 && distanceB > 1) return -1
    if (distanceB <= 1 && distanceA > 1) return 1

    // Then by frequency
    if (a.frequency !== b.frequency) {
      return b.frequency - a.frequency
    }

    // Then by recency
    if (a.lastSceneIndex !== b.lastSceneIndex) {
      return b.lastSceneIndex - a.lastSceneIndex
    }

    return b.lastElementIndex - a.lastElementIndex
  })
}

export const CharacterAutocomplete: React.FC<CharacterAutocompleteProps> = ({
  elementRef,
  isActive,
  onSuggestionSelect,
  scenes,
  currentSceneId,
}) => {
  const [suggestions, setSuggestions] = useState<CharacterInfo[]>([])
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null)
  const suggestionListRef = useRef<HTMLDivElement>(null)

  const getSuggestions = useCallback((text: string): CharacterInfo[] => {
    const normalizedInput = normalizeCharacterName(text)

    // Don't show suggestions if input is empty or too short
    if (normalizedInput.length === 0) {
      return []
    }

    const currentSceneIndex = scenes.findIndex(s => s.id === currentSceneId)
    const allCharacters = extractCharacters(scenes, currentSceneId)
    const rankedCharacters = rankCharacters(allCharacters, currentSceneIndex)

    // Filter by prefix match
    const matches = rankedCharacters
      .filter(char => char.name.startsWith(normalizedInput) && char.name !== normalizedInput)

    // Limit to top 5 suggestions for a cleaner look
    return matches.slice(0, 5)
  }, [scenes, currentSceneId])

  const updateSuggestions = useCallback(() => {
    if (!elementRef.current || !isActive) {
      setSuggestions([])
      setPosition(null)
      return
    }

    const text = elementRef.current.textContent || ""
    const newSuggestions = getSuggestions(text)

    if (newSuggestions.length > 0) {
      setSuggestions(newSuggestions)
      setSelectedIndex(0)

      // Calculate position for suggestions dropdown
      const rect = elementRef.current.getBoundingClientRect()
      setPosition({
        top: rect.bottom + 4,
        left: rect.left,
      })
    } else {
      setSuggestions([])
      setPosition(null)
    }
  }, [elementRef, isActive, getSuggestions])

  useEffect(() => {
    if (!elementRef.current || !isActive) return

    const element = elementRef.current

    const handleInput = () => {
      updateSuggestions()
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      // Only handle events when we have suggestions
      if (suggestions.length === 0) return

      if (e.key === "ArrowDown") {
        e.preventDefault()
        e.stopPropagation()
        setSelectedIndex(prev => (prev + 1) % suggestions.length)
      } else if (e.key === "ArrowUp") {
        e.preventDefault()
        e.stopPropagation()
        setSelectedIndex(prev => (prev - 1 + suggestions.length) % suggestions.length)
      } else if (e.key === "Tab" || e.key === "Enter") {
        e.preventDefault()
        e.stopPropagation()
        onSuggestionSelect(suggestions[selectedIndex].name)
        setSuggestions([])
        setPosition(null)
      } else if (e.key === "Escape") {
        e.preventDefault()
        e.stopPropagation()
        setSuggestions([])
        setPosition(null)
      }
    }

    element.addEventListener("input", handleInput)
    element.addEventListener("keydown", handleKeyDown)

    return () => {
      element.removeEventListener("input", handleInput)
      element.removeEventListener("keydown", handleKeyDown)
    }
  }, [elementRef, isActive, suggestions, selectedIndex, onSuggestionSelect, updateSuggestions])

  // Scroll selected item into view
  useEffect(() => {
    if (suggestionListRef.current && suggestions.length > 0) {
      const selectedElement = suggestionListRef.current.children[selectedIndex + 1] as HTMLElement // +1 for header
      if (selectedElement) {
        selectedElement.scrollIntoView({ block: "nearest" })
      }
    }
  }, [selectedIndex, suggestions.length])

  if (!isActive || suggestions.length === 0 || !position) {
    return null
  }

  return (
    <div
      ref={suggestionListRef}
      role="listbox"
      aria-label="Character suggestions"
      className="fixed z-50 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-xl overflow-hidden animate-in fade-in slide-in-from-top-1 duration-150"
      style={{
        top: `${position.top}px`,
        left: `${position.left}px`,
        minWidth: "180px",
        maxWidth: "280px",
      }}
    >
      {/* Header */}
      <div className="px-3 py-1.5 bg-gray-50 dark:bg-gray-800 border-b border-gray-100 dark:border-gray-700 flex items-center gap-2">
        <User className="h-3 w-3 text-gray-400" />
        <span className="text-[10px] font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
          Characters
        </span>
      </div>

      {/* Suggestions */}
      <div className="py-1">
        {suggestions.map((suggestion, index) => (
          <div
            key={suggestion.name}
            role="option"
            aria-selected={index === selectedIndex}
            className={cn(
              "px-3 py-1.5 cursor-pointer flex items-center justify-between gap-3 transition-colors",
              index === selectedIndex
                ? "bg-blue-500 text-white"
                : "hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-900 dark:text-gray-100"
            )}
            onClick={() => {
              onSuggestionSelect(suggestion.name)
              setSuggestions([])
              setPosition(null)
            }}
          >
            <span className="font-['Courier_New',Courier,monospace] text-xs font-medium truncate">
              {suggestion.name}
            </span>
            <div className="flex items-center gap-1.5 flex-shrink-0">
              {suggestion.isNearby && (
                <span
                  className={cn(
                    "text-[9px] px-1 py-0.5 rounded font-medium",
                    index === selectedIndex
                      ? "bg-blue-400 text-white"
                      : "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400"
                  )}
                >
                  nearby
                </span>
              )}
              <span
                className={cn(
                  "text-[10px] tabular-nums",
                  index === selectedIndex
                    ? "text-blue-100"
                    : "text-gray-400 dark:text-gray-500"
                )}
              >
                ×{suggestion.frequency}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Footer hint */}
      <div className="px-3 py-1.5 bg-gray-50 dark:bg-gray-800 border-t border-gray-100 dark:border-gray-700">
        <div className="flex items-center gap-2 text-[10px] text-gray-400">
          <span className="flex items-center gap-1">
            <kbd className="px-1 py-0.5 bg-gray-200 dark:bg-gray-700 rounded text-[9px] font-mono">↑↓</kbd>
            <span>navigate</span>
          </span>
          <span className="flex items-center gap-1">
            <kbd className="px-1 py-0.5 bg-gray-200 dark:bg-gray-700 rounded text-[9px] font-mono">↵</kbd>
            <span>select</span>
          </span>
          <span className="flex items-center gap-1">
            <kbd className="px-1 py-0.5 bg-gray-200 dark:bg-gray-700 rounded text-[9px] font-mono">esc</kbd>
            <span>dismiss</span>
          </span>
        </div>
      </div>
    </div>
  )
}

"use client"

import React, { useState, useEffect, useRef, useCallback } from "react"
import { cn } from "@/lib/utils"

const SCENE_PREFIXES = ["INT.", "EXT.", "I/E.", "INT./EXT."]

const TIME_OF_DAY = [
  "DAY",
  "NIGHT",
  "MORNING",
  "AFTERNOON",
  "EVENING",
  "SUNSET",
  "SUNRISE",
  "CONTINUOUS",
  "LATER",
  "MOMENTS LATER",
]

interface SceneHeadingAutocompleteProps {
  elementRef: React.RefObject<HTMLDivElement | null>
  isActive: boolean
  onSuggestionSelect: (suggestion: string) => void
}

export const SceneHeadingAutocomplete: React.FC<SceneHeadingAutocompleteProps> = ({
  elementRef,
  isActive,
  onSuggestionSelect,
}) => {
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null)
  const suggestionListRef = useRef<HTMLDivElement>(null)

  const getSuggestions = useCallback((text: string): string[] => {
    const trimmedText = text.trim().toUpperCase()

    // Check if text ends with a dash followed by optional spaces
    const dashMatch = trimmedText.match(/^(INT\.|EXT\.|I\/E\.|INT\.\/EXT\.)\s+.+\s+-\s*(.*)$/)

    if (dashMatch) {
      const afterDash = dashMatch[2]
      // Suggest time of day
      if (afterDash === "") {
        return TIME_OF_DAY
      }
      return TIME_OF_DAY.filter(time => time.startsWith(afterDash))
    }

    // Suggest scene prefixes at the start
    if (trimmedText === "" || SCENE_PREFIXES.some(prefix => prefix.startsWith(trimmedText))) {
      return SCENE_PREFIXES.filter(prefix => prefix.startsWith(trimmedText))
    }

    return []
  }, [])

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
        top: rect.bottom + window.scrollY,
        left: rect.left + window.scrollX,
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
        onSuggestionSelect(suggestions[selectedIndex])
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
      const selectedElement = suggestionListRef.current.children[selectedIndex] as HTMLElement
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
      className="fixed z-50 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md shadow-lg max-h-60 overflow-y-auto"
      style={{
        top: `${position.top}px`,
        left: `${position.left}px`,
        minWidth: "200px",
      }}
    >
      {suggestions.map((suggestion, index) => (
        <div
          key={suggestion}
          className={cn(
            "px-3 py-2 cursor-pointer font-['Courier_New',Courier,monospace] text-sm",
            index === selectedIndex
              ? "bg-blue-500 text-white"
              : "hover:bg-gray-100 dark:hover:bg-gray-700"
          )}
          onClick={() => {
            onSuggestionSelect(suggestion)
            setSuggestions([])
            setPosition(null)
          }}
        >
          {suggestion}
        </div>
      ))}
    </div>
  )
}

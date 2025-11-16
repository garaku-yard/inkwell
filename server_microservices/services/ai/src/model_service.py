# AI Service ML/NLP Core Logic
import logging
import re
from typing import Dict, List, Any, Optional
from dataclasses import dataclass
import json

@dataclass
class CharacterInfo:
    name: str
    dialogue_lines: List[str]
    actions: List[str]
    first_appearance: int
    total_scenes: int

@dataclass
class SceneInfo:
    scene_number: int
    location: str
    time: str
    characters: List[str]
    dialogue_count: int
    action_count: int

class ScreenplayAnalyzer:
    """Core ML/NLP logic for screenplay analysis"""
    
    def __init__(self):
        self.logger = logging.getLogger(__name__)
        self.character_pattern = r'^([A-Z][A-Z\s]+)$'
        self.scene_header_pattern = r'^(INT\.|EXT\.)\s+(.+?)\s*-\s*(.+?)$'
        
    def extract_characters(self, screenplay_content: str) -> Dict[str, CharacterInfo]:
        """Extract and analyze characters from screenplay"""
        lines = screenplay_content.split('\n')
        characters = {}
        current_scene = 0
        
        for i, line in enumerate(lines):
            line = line.strip()
            
            # Check for scene headers
            if re.match(self.scene_header_pattern, line):
                current_scene += 1
                continue
                
            # Check for character names (speaking)
            char_match = re.match(self.character_pattern, line)
            if char_match:
                char_name = char_match.group(1).strip()
                
                if char_name not in characters:
                    characters[char_name] = CharacterInfo(
                        name=char_name,
                        dialogue_lines=[],
                        actions=[],
                        first_appearance=current_scene,
                        total_scenes=0
                    )
                
                # Look for dialogue following the character name
                if i + 1 < len(lines):
                    next_line = lines[i + 1].strip()
                    if next_line and not re.match(self.character_pattern, next_line):
                        characters[char_name].dialogue_lines.append(next_line)
        
        return characters
    
    def analyze_dialogue_quality(self, characters: Dict[str, CharacterInfo]) -> Dict[str, Any]:
        """Analyze dialogue quality and character voice"""
        analysis = {
            "character_voices": {},
            "dialogue_distribution": {},
            "voice_consistency": {},
            "suggestions": []
        }
        
        total_dialogue = sum(len(char.dialogue_lines) for char in characters.values())
        
        for char_name, char_info in characters.items():
            dialogue_count = len(char_info.dialogue_lines)
            
            # Dialogue distribution
            analysis["dialogue_distribution"][char_name] = {
                "line_count": dialogue_count,
                "percentage": (dialogue_count / total_dialogue * 100) if total_dialogue > 0 else 0
            }
            
            # Voice analysis
            avg_line_length = sum(len(line.split()) for line in char_info.dialogue_lines) / max(1, dialogue_count)
            
            analysis["character_voices"][char_name] = {
                "avg_words_per_line": avg_line_length,
                "total_lines": dialogue_count,
                "voice_characteristics": self._analyze_voice_patterns(char_info.dialogue_lines)
            }
        
        # Generate suggestions
        analysis["suggestions"] = self._generate_dialogue_suggestions(analysis)
        
        return analysis
    
    def analyze_plot_structure(self, screenplay_content: str) -> Dict[str, Any]:
        """Analyze plot structure and pacing"""
        scenes = self._extract_scenes(screenplay_content)
        
        analysis = {
            "total_scenes": len(scenes),
            "scene_distribution": {},
            "pacing_analysis": {},
            "structure_notes": [],
            "suggestions": []
        }
        
        # Analyze scene distribution
        for scene in scenes:
            location_type = "INT" if scene.location.startswith("INT.") else "EXT"
            if location_type not in analysis["scene_distribution"]:
                analysis["scene_distribution"][location_type] = 0
            analysis["scene_distribution"][location_type] += 1
        
        # Pacing analysis
        analysis["pacing_analysis"] = self._analyze_pacing(scenes)
        
        # Structure analysis
        analysis["structure_notes"] = self._analyze_structure(scenes)
        
        return analysis
    
    def generate_format_suggestions(self, screenplay_content: str, format_type: str = "feature") -> Dict[str, Any]:
        """Check and suggest format improvements"""
        lines = screenplay_content.split('\n')
        errors = []
        suggestions = []
        
        for i, line in enumerate(lines):
            line_stripped = line.strip()
            
            # Check scene headers
            if re.match(r'^(INT\.|EXT\.)', line_stripped):
                if not re.match(self.scene_header_pattern, line_stripped):
                    errors.append(f"Line {i+1}: Improper scene header format")
                    suggestions.append("Use format: INT./EXT. LOCATION - TIME")
            
            # Check character names
            elif re.match(self.character_pattern, line_stripped):
                if not line_stripped.isupper():
                    errors.append(f"Line {i+1}: Character names should be in ALL CAPS")
                
                # Check for proper spacing
                if line.startswith(' '):
                    errors.append(f"Line {i+1}: Character names should not be indented")
        
        return {
            "format_errors": errors,
            "format_suggestions": suggestions,
            "format_score": max(0, 10 - len(errors) * 0.5),
            "corrected_content": self._apply_format_corrections(screenplay_content)
        }
    
    def _extract_scenes(self, content: str) -> List[SceneInfo]:
        """Extract scene information from screenplay"""
        lines = content.split('\n')
        scenes = []
        current_scene = None
        
        for line in lines:
            line_stripped = line.strip()
            
            # Check for scene header
            scene_match = re.match(self.scene_header_pattern, line_stripped)
            if scene_match:
                if current_scene:
                    scenes.append(current_scene)
                
                current_scene = SceneInfo(
                    scene_number=len(scenes) + 1,
                    location=scene_match.group(2),
                    time=scene_match.group(3),
                    characters=[],
                    dialogue_count=0,
                    action_count=0
                )
            elif current_scene:
                # Count dialogue and action lines
                if re.match(self.character_pattern, line_stripped):
                    if line_stripped not in current_scene.characters:
                        current_scene.characters.append(line_stripped)
                    current_scene.dialogue_count += 1
                elif line_stripped and not line_stripped.startswith('('):
                    current_scene.action_count += 1
        
        if current_scene:
            scenes.append(current_scene)
        
        return scenes
    
    def _analyze_voice_patterns(self, dialogue_lines: List[str]) -> Dict[str, Any]:
        """Analyze character voice patterns"""
        if not dialogue_lines:
            return {"word_variety": 0, "avg_sentence_length": 0}
        
        all_words = []
        sentence_lengths = []
        
        for line in dialogue_lines:
            words = line.split()
            all_words.extend(words)
            sentences = re.split(r'[.!?]+', line)
            sentence_lengths.extend([len(s.split()) for s in sentences if s.strip()])
        
        unique_words = set(word.lower() for word in all_words)
        
        return {
            "word_variety": len(unique_words) / max(1, len(all_words)),
            "avg_sentence_length": sum(sentence_lengths) / max(1, len(sentence_lengths)),
            "total_words": len(all_words),
            "unique_words": len(unique_words)
        }
    
    def _generate_dialogue_suggestions(self, analysis: Dict[str, Any]) -> List[str]:
        """Generate dialogue improvement suggestions"""
        suggestions = []
        
        # Check for dialogue distribution
        distribution = analysis["dialogue_distribution"]
        if distribution:
            max_speaker = max(distribution.keys(), key=lambda x: distribution[x]["percentage"])
            if distribution[max_speaker]["percentage"] > 40:
                suggestions.append(f"{max_speaker} dominates dialogue. Consider balancing with other characters.")
        
        # Check for voice diversity
        voices = analysis["character_voices"]
        if len(voices) > 1:
            lengths = [v["avg_words_per_line"] for v in voices.values()]
            if max(lengths) - min(lengths) < 2:
                suggestions.append("Character voices seem similar. Consider varying sentence length and vocabulary.")
        
        return suggestions
    
    def _analyze_pacing(self, scenes: List[SceneInfo]) -> Dict[str, Any]:
        """Analyze screenplay pacing"""
        if not scenes:
            return {}
        
        dialogue_heavy = sum(1 for scene in scenes if scene.dialogue_count > scene.action_count * 2)
        action_heavy = sum(1 for scene in scenes if scene.action_count > scene.dialogue_count * 2)
        
        return {
            "dialogue_heavy_scenes": dialogue_heavy,
            "action_heavy_scenes": action_heavy,
            "balanced_scenes": len(scenes) - dialogue_heavy - action_heavy,
            "avg_dialogue_per_scene": sum(s.dialogue_count for s in scenes) / len(scenes),
            "avg_action_per_scene": sum(s.action_count for s in scenes) / len(scenes)
        }
    
    def _analyze_structure(self, scenes: List[SceneInfo]) -> List[str]:
        """Analyze structural elements"""
        notes = []
        
        if len(scenes) < 3:
            notes.append("Very short screenplay - consider expanding")
        elif len(scenes) > 120:
            notes.append("Very long screenplay - consider condensing")
        
        # Check for location variety
        locations = [scene.location for scene in scenes]
        unique_locations = set(locations)
        if len(unique_locations) < len(scenes) * 0.3:
            notes.append("Consider more location variety")
        
        return notes
    
    def _apply_format_corrections(self, content: str) -> str:
        """Apply basic format corrections"""
        lines = content.split('\n')
        corrected_lines = []
        
        for line in lines:
            corrected_line = line
            
            # Fix character names to ALL CAPS
            if re.match(r'^[a-zA-Z\s]+$', line.strip()) and len(line.strip().split()) <= 3:
                corrected_line = line.upper()
            
            corrected_lines.append(corrected_line)
        
        return '\n'.join(corrected_lines)
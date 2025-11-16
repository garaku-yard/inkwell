import asyncio
import grpc
from concurrent import futures
import logging
import os
from datetime import datetime
import json
import uuid
import time

# Import generated protobuf classes (will be generated from .proto files)
# import ai_pb2
# import ai_pb2_grpc
# import common_pb2

# Import AI/ML libraries
import openai
# import torch
# import transformers

class AIService:
    def __init__(self):
        self.logger = logging.getLogger(__name__)
        self.openai_client = None
        self._setup_ai_models()
    
    def _setup_ai_models(self):
        """Initialize AI models and clients"""
        # Setup OpenAI client
        openai_api_key = os.getenv('OPENAI_API_KEY')
        if openai_api_key:
            self.openai_client = openai.OpenAI(api_key=openai_api_key)
            self.logger.info("OpenAI client initialized")
        else:
            self.logger.warning("OpenAI API key not found")
        
        # TODO: Initialize local models if needed
        # self._load_local_models()
    
    async def generate_content(self, request):
        """Generate screenplay content using AI"""
        try:
            # Validate request
            if not request.prompt:
                return {"error": "Prompt is required"}
            
            # Prepare context
            context = self._prepare_generation_context(request)
            
            # Generate content based on type
            if request.type == "dialogue":
                content = await self._generate_dialogue(request, context)
            elif request.type == "scene":
                content = await self._generate_scene(request, context)
            elif request.type == "character":
                content = await self._generate_character(request, context)
            elif request.type == "plot_point":
                content = await self._generate_plot_point(request, context)
            else:
                content = await self._generate_general(request, context)
            
            return {
                "generated_content": content["main"],
                "alternatives": content.get("alternatives", []),
                "confidence_score": content.get("confidence", 0.8),
                "request_id": str(uuid.uuid4())
            }
            
        except Exception as e:
            self.logger.error(f"Content generation error: {str(e)}")
            return {"error": str(e)}
    
    async def analyze_content(self, request):
        """Analyze screenplay content"""
        try:
            results = []
            
            for analysis_type in request.analysis_types:
                if analysis_type == "character_analysis":
                    result = await self._analyze_characters(request.content)
                elif analysis_type == "plot_analysis":
                    result = await self._analyze_plot(request.content)
                elif analysis_type == "dialogue_analysis":
                    result = await self._analyze_dialogue(request.content)
                else:
                    continue
                
                results.append({
                    "id": str(uuid.uuid4()),
                    "type": analysis_type,
                    "content": json.dumps(result),
                    "confidence_score": result.get("confidence", 0.8),
                    "suggestions": result.get("suggestions", []),
                    "created_at": self._get_timestamp()
                })
            
            return {
                "results": results,
                "request_id": str(uuid.uuid4())
            }
            
        except Exception as e:
            self.logger.error(f"Content analysis error: {str(e)}")
            return {"error": str(e)}
    
    async def get_improvements(self, request):
        """Provide script improvement suggestions"""
        try:
            analysis = await self._analyze_for_improvements(
                request.screenplay_content,
                request.focus_area
            )
            
            return {
                "suggestions": analysis["general_suggestions"],
                "specific_improvements": analysis["specific_improvements"],
                "overall_score": analysis["overall_score"],
                "category_scores": analysis["category_scores"]
            }
            
        except Exception as e:
            self.logger.error(f"Improvement analysis error: {str(e)}")
            return {"error": str(e)}
    
    async def develop_character(self, request):
        """Provide character development suggestions"""
        try:
            development = await self._analyze_character_development(
                request.character_name,
                request.character_description,
                request.story_context
            )
            
            return development
            
        except Exception as e:
            self.logger.error(f"Character development error: {str(e)}")
            return {"error": str(e)}
    
    async def analyze_genre(self, request):
        """Analyze genre and tone"""
        try:
            analysis = await self._analyze_genre_and_tone(request.screenplay_content)
            return analysis
            
        except Exception as e:
            self.logger.error(f"Genre analysis error: {str(e)}")
            return {"error": str(e)}
    
    async def check_format(self, request):
        """Check screenplay format"""
        try:
            format_analysis = await self._check_screenplay_format(
                request.screenplay_content,
                request.format_type
            )
            
            return format_analysis
            
        except Exception as e:
            self.logger.error(f"Format checking error: {str(e)}")
            return {"error": str(e)}
    
    # Private helper methods
    def _prepare_generation_context(self, request):
        """Prepare context for content generation"""
        context = {
            "type": request.type,
            "prompt": request.prompt,
            "max_length": request.max_length or 500,
            "temperature": request.temperature or 0.7,
            "additional_context": dict(request.context) if request.context else {}
        }
        return context
    
    async def _generate_dialogue(self, request, context):
        """Generate dialogue specifically"""
        if not self.openai_client:
            return {"main": "AI service not available", "alternatives": []}
        
        prompt = f"""
        Generate natural, engaging dialogue for a screenplay based on this prompt:
        {request.prompt}
        
        Context: {context['additional_context']}
        
        Requirements:
        - Make it sound natural and character-specific
        - Include appropriate action lines if needed
        - Follow proper screenplay format
        - Maximum length: {context['max_length']} characters
        
        Generate the dialogue:
        """
        
        try:
            response = self.openai_client.chat.completions.create(
                model="gpt-3.5-turbo",
                messages=[{"role": "user", "content": prompt}],
                temperature=context['temperature'],
                max_tokens=min(context['max_length'] // 4, 1000)
            )
            
            content = response.choices[0].message.content
            
            # Generate alternatives with different temperatures
            alternatives = await self._generate_alternatives(prompt, context, 2)
            
            return {
                "main": content,
                "alternatives": alternatives,
                "confidence": 0.85
            }
            
        except Exception as e:
            self.logger.error(f"Dialogue generation error: {str(e)}")
            return {"main": "Error generating dialogue", "alternatives": []}
    
    async def _generate_scene(self, request, context):
        """Generate scene description"""
        # Implementation for scene generation
        return {"main": "Generated scene description", "alternatives": []}
    
    async def _generate_character(self, request, context):
        """Generate character description"""
        # Implementation for character generation
        return {"main": "Generated character description", "alternatives": []}
    
    async def _generate_plot_point(self, request, context):
        """Generate plot point"""
        # Implementation for plot point generation
        return {"main": "Generated plot point", "alternatives": []}
    
    async def _generate_general(self, request, context):
        """Generate general content"""
        # Implementation for general content generation
        return {"main": "Generated general content", "alternatives": []}
    
    async def _generate_alternatives(self, prompt, context, count):
        """Generate alternative versions"""
        alternatives = []
        # Implementation for generating alternatives
        return alternatives
    
    async def _analyze_characters(self, content):
        """Analyze characters in the script"""
        # Implementation for character analysis
        return {
            "characters_found": [],
            "character_development": {},
            "suggestions": [],
            "confidence": 0.8
        }
    
    async def _analyze_plot(self, content):
        """Analyze plot structure"""
        # Implementation for plot analysis
        return {
            "structure_analysis": {},
            "pacing_notes": [],
            "suggestions": [],
            "confidence": 0.8
        }
    
    async def _analyze_dialogue(self, content):
        """Analyze dialogue quality"""
        # Implementation for dialogue analysis
        return {
            "dialogue_quality": {},
            "voice_consistency": {},
            "suggestions": [],
            "confidence": 0.8
        }
    
    async def _analyze_for_improvements(self, content, focus_area):
        """Analyze script for improvements"""
        # Implementation for improvement analysis
        return {
            "general_suggestions": [],
            "specific_improvements": [],
            "overall_score": 7.5,
            "category_scores": {
                "dialogue": 8.0,
                "pacing": 7.0,
                "structure": 8.5,
                "characters": 7.5
            }
        }
    
    async def _analyze_character_development(self, name, description, context):
        """Analyze character development opportunities"""
        # Implementation for character development analysis
        return {
            "personality_traits": [],
            "backstory_elements": [],
            "arc_suggestions": [],
            "dialogue_style_notes": []
        }
    
    async def _analyze_genre_and_tone(self, content):
        """Analyze genre and tone"""
        # Implementation for genre analysis
        return {
            "genre_probabilities": {"drama": 0.7, "thriller": 0.2, "comedy": 0.1},
            "dominant_tone": "dramatic",
            "tone_indicators": [],
            "genre_consistency_score": 8.5
        }
    
    async def _check_screenplay_format(self, content, format_type):
        """Check screenplay formatting"""
        # Implementation for format checking
        return {
            "format_errors": [],
            "format_suggestions": [],
            "corrected_content": content,
            "format_score": 9.0
        }
    
    def _get_timestamp(self):
        """Get current timestamp"""
        now = datetime.now()
        return {
            "seconds": int(now.timestamp()),
            "nanos": int((now.timestamp() % 1) * 1e9)
        }

# gRPC server setup
def serve():
    logging.basicConfig(level=logging.INFO)
    server = grpc.server(futures.ThreadPoolExecutor(max_workers=10))
    
    # Add AI service to server (uncomment when protobuf is generated)
    # ai_service = AIService()
    # ai_pb2_grpc.add_AIServiceServicer_to_server(ai_service, server)
    
    listen_addr = f"0.0.0.0:{os.getenv('AI_SERVICE_PORT', '50051')}"
    server.add_insecure_port(listen_addr)
    
    logging.info(f"AI Service starting on {listen_addr}")
    server.start()
    server.wait_for_termination()

if __name__ == "__main__":
    serve()
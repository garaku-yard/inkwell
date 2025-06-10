"use client"

import { Button } from "@/components/ui/button"
import { FileText } from "lucide-react"
import Link from "next/link"

export default function HomePage() {
  return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-center p-6 relative overflow-hidden">
      <div className="absolute inset-0 opacity-10">
        <div className="absolute inset-0 bg-gradient-to-br from-black/5 to-transparent"></div>

        <div className="absolute top-0 left-0 w-full h-full">
          {[...Array(12)].map((_, i) => (
            <div
              key={i}
              className="absolute animate-pulse"
              style={{
                left: `${Math.random() * 100}%`,
                top: `${Math.random() * 100}%`,
                animationDelay: `${Math.random() * 3}s`,
                animationDuration: `${3 + Math.random() * 2}s`,
              }}
            >
              <div
                className={`w-${8 + Math.floor(Math.random() * 16)} h-${8 + Math.floor(Math.random() * 16)} bg-black`}
                style={{
                  clipPath: "polygon(30% 0%, 70% 0%, 100% 50%, 70% 100%, 30% 100%, 0% 50%)",
                  transform: `rotate(${Math.random() * 360}deg)`,
                }}
              ></div>
            </div>
          ))}
        </div>

        <svg className="absolute inset-0 w-full h-full" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <pattern id="hexPattern" x="0" y="0" width="100" height="100" patternUnits="userSpaceOnUse">
              <polygon
                points="50,5 85,25 85,65 50,85 15,65 15,25"
                fill="none"
                stroke="black"
                strokeWidth="0.5"
                opacity="0.1"
              />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#hexPattern)" />

          <line x1="0" y1="0" x2="100%" y2="100%" stroke="black" strokeWidth="1" opacity="0.05" />
          <line x1="100%" y1="0" x2="0" y2="100%" stroke="black" strokeWidth="1" opacity="0.05" />
          <line x1="50%" y1="0" x2="50%" y2="100%" stroke="black" strokeWidth="1" opacity="0.03" />
          <line x1="0" y1="50%" x2="100%" y2="50%" stroke="black" strokeWidth="1" opacity="0.03" />
        </svg>
      </div>

      <div className="text-center z-10 relative">
        <div className="absolute -inset-8 border border-black/20 transform rotate-1"></div>
        <div className="absolute -inset-6 border border-black/10 transform -rotate-1"></div>

        <div className="relative mb-8">
          <div className="absolute inset-0 bg-black transform rotate-45 scale-110 opacity-20"></div>
          <div
            className="relative p-6 bg-black border-4 border-white shadow-2xl"
            style={{
              clipPath: "polygon(20% 0%, 80% 0%, 100% 20%, 100% 80%, 80% 100%, 20% 100%, 0% 80%, 0% 20%)",
            }}
          >
            <FileText className="h-16 w-16 text-white" />
          </div>
        </div>

        <div className="mb-12 relative">
          <div className="absolute inset-0 text-4xl font-bold text-black/10 transform translate-x-1 translate-y-1">
           ScreenWriter 
          </div>
          <h1 className="text-4xl font-bold text-black relative tracking-wider">
            Screen<span className="text-gray-600">Writer</span>
          </h1>
          <div className="w-24 h-1 bg-black mx-auto mt-4 transform skew-x-12"></div>
        </div>

        <div className="relative group">
          <div className="absolute inset-0 bg-black transform rotate-1 group-hover:rotate-2 transition-transform duration-300"></div>
          <Button
            size="lg"
            className="relative text-xl px-12 py-6 bg-black text-white hover:bg-gray-800 border-4 border-white shadow-xl transform hover:-translate-y-1 transition-all duration-300"
            asChild
          >
            <Link href="/login">
              <span className="relative z-10">Start Writing Now</span>
            </Link>
          </Button>
        </div>

        <div className="absolute -top-20 -left-20 w-4 h-4 bg-black transform rotate-45"></div>
        <div className="absolute -top-16 -right-24 w-3 h-3 bg-black transform rotate-45"></div>
        <div className="absolute -bottom-20 -left-16 w-5 h-5 bg-black transform rotate-45"></div>
        <div className="absolute -bottom-24 -right-20 w-2 h-2 bg-black transform rotate-45"></div>
      </div>

      <div className="absolute top-8 left-8">
        <div className="w-16 h-16 border-l-2 border-t-2 border-black/30"></div>
      </div>
      <div className="absolute top-8 right-8">
        <div className="w-16 h-16 border-r-2 border-t-2 border-black/30"></div>
      </div>
      <div className="absolute bottom-8 left-8">
        <div className="w-16 h-16 border-l-2 border-b-2 border-black/30"></div>
      </div>
      <div className="absolute bottom-8 right-8">
        <div className="w-16 h-16 border-r-2 border-b-2 border-black/30"></div>
      </div>
    </div>
  )
}

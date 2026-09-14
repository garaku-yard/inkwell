"use client"

import Script from "next/script"

declare global {
  interface Window {
    Paddle?: {
      Environment: { set(environment: "sandbox"): void }
      Initialize(options: { token: string }): void
    }
  }
}

const token = process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN
const environment = process.env.NEXT_PUBLIC_PADDLE_ENVIRONMENT

export function PaddleCheckout() {
  if (!token) {
    return <p className="text-sm text-muted-foreground">Checkout is not configured.</p>
  }

  return (
    <>
      <Script
        src="https://cdn.paddle.com/paddle/v2/paddle.js"
        strategy="afterInteractive"
        onLoad={() => {
          if (!window.Paddle) return
          if (environment === "sandbox") window.Paddle.Environment.set("sandbox")
          window.Paddle.Initialize({ token })
        }}
      />
      <p className="text-sm text-muted-foreground">Opening secure checkout…</p>
    </>
  )
}

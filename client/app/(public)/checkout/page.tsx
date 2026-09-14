import type { Metadata } from "next"

import { PaddleCheckout } from "./paddle-checkout"

export const metadata: Metadata = { title: "Checkout — Inkwell" }

export default function CheckoutPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-6">
      <section className="w-full max-w-md rounded-xl border bg-card p-8 text-center shadow-sm">
        <h1 className="text-2xl font-semibold">Inkwell checkout</h1>
        <div className="mt-3"><PaddleCheckout /></div>
      </section>
    </main>
  )
}

/// <reference types="@testing-library/jest-dom" />

// Vitest's expect doesn't auto-merge jest-dom matcher types because the
// jest-dom module declares them under `@vitest/expect`'s namespace only
// when explicitly imported. The triple-slash above pulls in the full
// matcher set so test files don't each need their own reference.
import "@testing-library/jest-dom/vitest"

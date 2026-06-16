/** Brute-force nearest-neighbour ranking for vault-as-knowledge retrieval.
 *
 *  Embeddings are L2-normalised at generation time (the embedder runs with
 *  `normalize: true`), so cosine similarity reduces to a plain dot product.
 *  Scanning every chunk in JS is fine up to ~10k chunks (~50ms/query); swap
 *  in a vector index only if a vault outgrows that. Pure and testable. */

/** A candidate vector paired with whatever payload the caller wants back
 *  (chunk text, source filename, etc.). */
export interface VectorRow<T> {
  vector: Float32Array
  payload: T
}

/** A ranked result: the original payload plus its similarity score. */
export interface ScoredRow<T> {
  payload: T
  score: number
}

/** Dot product of two equal-length normalised vectors. Truncates to the
 *  shorter length defensively so a dimension mismatch can't read past the
 *  end of either buffer. */
export function dot(a: Float32Array, b: Float32Array): number {
  const n = Math.min(a.length, b.length)
  let sum = 0
  for (let i = 0; i < n; i++) sum += a[i] * b[i]
  return sum
}

/** Returns the `k` rows most similar to `query`, highest score first.
 *
 *  @param query - The query embedding (normalised).
 *  @param rows - Candidate vectors with attached payloads.
 *  @param k - Maximum number of results.
 *  @returns Up to `k` scored payloads sorted by descending similarity. */
export function cosineTopK<T>(
  query: Float32Array,
  rows: VectorRow<T>[],
  k: number,
): ScoredRow<T>[] {
  const scored = rows.map((r) => ({ payload: r.payload, score: dot(query, r.vector) }))
  scored.sort((a, b) => b.score - a.score)
  return scored.slice(0, Math.max(0, k))
}

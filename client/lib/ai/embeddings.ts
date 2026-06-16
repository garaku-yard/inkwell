/** Local sentence embeddings for vault-as-knowledge retrieval.
 *
 *  Wraps `@huggingface/transformers` running all-MiniLM-L6-v2 in the webview.
 *  Inference is local — note text and chat queries are embedded on-device and
 *  the vectors never leave the machine. The library is dynamic-imported on
 *  first use, so users who never wire a vault as knowledge pay nothing.
 *
 *  Network caveat: this is NOT fully offline on first use. With
 *  `allowLocalModels = false` and no app-bundled weights, the ~22MB model is
 *  fetched from the HuggingFace hub (`huggingface.co`) and the ONNX WASM
 *  runtime from a CDN (`cdn.jsdelivr.net`) the first time {@link embed} runs;
 *  both are cached by the library afterwards, so subsequent indexing/querying
 *  works offline. So the *first* index build requires a network connection.
 *  (Bundling the model + WASM for a true zero-network first run is a tracked
 *  follow-up — it needs a real Tauri runtime pass to verify the local paths.) */

/** HuggingFace model id. all-MiniLM-L6-v2 emits 384-dim normalised vectors. */
const MODEL_ID = "Xenova/all-MiniLM-L6-v2"

/** Output dimensionality of {@link MODEL_ID}. */
export const EMBED_DIM = 384

/** Minimal shape of the feature-extraction pipeline we depend on, so this
 *  module doesn't pull the library's heavy types into every importer. */
type Extractor = (
  texts: string[],
  opts: { pooling: "mean"; normalize: boolean },
) => Promise<{ tolist(): number[][] }>

let extractorPromise: Promise<Extractor> | null = null

/** Lazily loads (and caches) the embedding pipeline. The first call triggers
 *  the library + model download; subsequent calls reuse the singleton. */
function getExtractor(): Promise<Extractor> {
  if (!extractorPromise) {
    extractorPromise = (async () => {
      const { pipeline, env } = await import("@huggingface/transformers")
      // Models come from the HuggingFace hub; there are no app-bundled ones.
      env.allowLocalModels = false
      const extractor = await pipeline("feature-extraction", MODEL_ID)
      return extractor as unknown as Extractor
    })()
  }
  return extractorPromise
}

/** Embeds a batch of texts into normalised 384-dim vectors.
 *
 *  @param texts - Strings to embed (chunks, or a single query).
 *  @returns One {@link Float32Array} per input, in the same order. Empty input
 *    returns an empty array without loading the model. */
export async function embed(texts: string[]): Promise<Float32Array[]> {
  if (texts.length === 0) return []
  const extractor = await getExtractor()
  const output = await extractor(texts, { pooling: "mean", normalize: true })
  return output.tolist().map((row) => Float32Array.from(row))
}

/** Embeds a single text and returns its vector. Convenience over {@link embed}
 *  for the retrieval query path. */
export async function embedOne(text: string): Promise<Float32Array> {
  const [vec] = await embed([text])
  return vec
}

/** Serialises a vector to base64 of its little-endian Float32 buffer, for the
 *  `note_embeddings.vector` TEXT column. */
export function serializeVec(v: Float32Array): string {
  const bytes = new Uint8Array(v.buffer, v.byteOffset, v.byteLength)
  let binary = ""
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
  return btoa(binary)
}

/** Inverse of {@link serializeVec}: decodes a base64 string back into a
 *  Float32Array. */
export function deserializeVec(s: string): Float32Array {
  const binary = atob(s)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return new Float32Array(bytes.buffer)
}

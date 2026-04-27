/**
 * scripts/lib/bootstrap/extract.mjs · bootstrap-skill change · prompt loader + 5-layer extractor.
 *
 * D-012: prompt templates are HARD-CODED in scripts/bootstrap/prompts/*.md.
 * NO env var override. NO config file override. v1 contract.
 *
 * Loaded prompts:
 *   - sampling.md       (Phase 2 inference)
 *   - deep-dive-l1-l2.md (Profile + Preferences)
 *   - deep-dive-l3.md   (Episodic experience)
 *   - deep-dive-l4.md   (Domain)
 *   - deep-dive-l5.md   (Reflections)
 *   - commit.md         (markdown → atom JSON conversion in B10)
 *
 * Implementation lands in B8.
 */

// TODO B8: loadPrompt(name) → string (synchronous one-shot, throws if not found)
//          callLLMForLayer(layer, fileContent, hypothesis) → classification result

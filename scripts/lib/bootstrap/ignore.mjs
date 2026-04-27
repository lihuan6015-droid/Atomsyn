/**
 * scripts/lib/bootstrap/ignore.mjs · bootstrap-skill change · .atomsynignore parser.
 *
 * gitignore-style syntax (negation `!`, leading-slash anchoring, trailing-slash dirs,
 * standard glob chars). Built-in fallback list applies when no .atomsynignore is
 * present in the scan root. See design.md §7.2 for the fallback set.
 *
 * Implementation lands in B6.
 */

// TODO B6: parseIgnoreFile(text) → matcher fn (path → boolean ignored?)
//          loadIgnoreForRoot(root) → matcher (uses .atomsynignore or fallback)

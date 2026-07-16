// Test stub for `next/cache`. `unstable_cache` needs the Next runtime (Data
// Cache), which isn't available under Jest, so here it degrades to a pass-through
// that just invokes the fetcher (no caching). Tests that need to assert caching
// behaviour mock `next/cache` themselves with a caching implementation.
module.exports = {
  unstable_cache: (fn) => fn,
  revalidatePath: () => {},
  revalidateTag: () => {},
  unstable_noStore: () => {},
}

// @ts-check
import { defineConfig } from "astro/config";

export default defineConfig({
  /* The real production URL. `vitrine.vercel.app` belongs to someone else — it
     served a stranger's site when checked, so it was never ours to canonicalise
     to. Change this if a custom domain ever lands. */
  site: "https://vitrine-supernovaias-projects.vercel.app",
  devToolbar: { enabled: false },
});

import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default ({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");

  return defineConfig({
    plugins: [react()],
    define: {
      "import.meta.env.SUPABASE_URL": JSON.stringify(env.SUPABASE_URL),
      "import.meta.env.SUPABASE_PUBLISHABLE_KEY": JSON.stringify(env.SUPABASE_PUBLISHABLE_KEY),
      "import.meta.env.SUPABASE_ANON_KEY": JSON.stringify(env.SUPABASE_ANON_KEY),
      "import.meta.env.SUPABASE_KEY": JSON.stringify(env.SUPABASE_KEY),
    },
  });
};

const env = getEnv();

export class Config {
  static production = env.NODE_ENV === "production";
}
export class Keys {
  static supabase_anon = env.KEY_SUPABASE_ANON.trim();
  static posthog = env.KEY_POSTHOG.trim();
}
export class Urls {
  static supabase = env.URL_SUPABASE.trim();
  static posthog = env.URL_POSTHOG.trim();
}

// for now we can hardcode values, but soon we'll want to open source and hide values (will need to erase git history!).
// So we'll need to get values from an env file, that should apply during build as well. That's not trivial so won't do now.
// But then this function will just be `return process.env`
function getEnv() {
  const localEnv = `
NODE_ENV=production

KEY_SUPABASE_ANON=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ4aGFrZ2ppYnFrb2p5b2NmcGp0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE2NzQwNjA3MTAsImV4cCI6MTk4OTYzNjcxMH0.CLhNEQT7p75v-hq0oCraB6Xc8ciG18pkVmLDWTjrsAU
KEY_POSTHOG=phc_SQPRajl0Np93cxPSsBBTV1E7VlMcpBotEjGrbjAOeJI

URL_SUPABASE=https://rxhakgjibqkojyocfpjt.supabase.co
URL_POSTHOG=https://p-api.themetavoice.xyz
  `
    .trim()
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => line.split("="))
    .map((line) => [line[0], line.slice(1).join("=")])
    .map((line) => [line[0], line[1].replace(/(^"|"$)/g, "")])
    .reduce((acc, [key, value]) => {
      acc[key] = value;
      return acc;
    }, {});

  return {
    ...localEnv,
    // should be added to preload file in the future
    //...process.env,
  }
}

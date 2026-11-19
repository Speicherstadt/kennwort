import { m } from "@kennwort/ui";

// The app frame follows in K-302; until then the page proves that Solid, Paraglide and the build
// work together in every locale.
export const App = () => (
  <main>
    <h1>{m.app_name()}</h1>
    <p>{m.app_tagline()}</p>
  </main>
);

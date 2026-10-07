/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_TEST_HARNESS?: string;
}

interface Window {
  __auditSphereLegacyLoaded?: boolean;
  __auditSphereReactRoot?: ReturnType<typeof import('react-dom/client').createRoot>;
}

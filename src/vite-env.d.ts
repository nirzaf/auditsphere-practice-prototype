/// <reference types="vite/client" />

interface Window {
  __auditSphereReactRoot?: ReturnType<typeof import('react-dom/client').createRoot>;
}

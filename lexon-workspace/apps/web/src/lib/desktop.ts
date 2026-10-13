// Present only inside the Electron shell (exposed by the sandboxed preload script).
export interface DesktopApi { isDesktop: true; platform: string; openExternal(url: string): Promise<void> }
declare global { interface Window { lexonDesktop?: DesktopApi } }
export const desktop = () => window.lexonDesktop

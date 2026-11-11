import React, { createContext, useContext, useState, useEffect } from 'react';
import { trpc } from "@/lib/trpc";

interface BrandingContextType {
  appName: string;
  appLogo: string | null;
  primaryColor: string;
  setAppName: (name: string) => void;
  setAppLogo: (logo: string | null) => void;
  setPrimaryColor: (color: string) => void;
}

const BrandingContext = createContext<BrandingContextType | undefined>(undefined);

// Roxo do tema antigo: era o padrão gravado para todo tenant, então não conta
// como personalização -- nesses casos vale a paleta DMS do index.css.
const LEGACY_DEFAULT_COLOR = '#4b4897';

/** Aplica (ou remove) a cor de marca do tenant, com texto legível sobre ela. */
function applyPrimaryColor(color: string | null | undefined) {
  const style = document.documentElement.style;
  const hex = (color || '').trim().toLowerCase();
  const match = /^#([0-9a-f]{6})$/.exec(hex);
  if (!match || hex === LEGACY_DEFAULT_COLOR) {
    style.removeProperty('--primary');
    style.removeProperty('--primary-foreground');
    return;
  }
  const n = parseInt(match[1], 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  style.setProperty('--primary', hex);
  style.setProperty('--primary-foreground', luminance > 0.6 ? '#0a0e27' : '#ffffff');
}

export function BrandingProvider({ children }: { children: React.ReactNode }) {
  const { data: brandingData } = trpc.branding.get.useQuery(undefined, {
    staleTime: Infinity,
  });

  const [appName, setAppNameState] = useState('DStasks');
  const [appLogo, setAppLogoState] = useState<string | null>(null);
  const [primaryColor, setPrimaryColorState] = useState('#00d9ff');

  useEffect(() => {
    if (brandingData) {
      setAppNameState(brandingData.appName);
      setAppLogoState(brandingData.appLogoUrl);
      setPrimaryColorState(brandingData.primaryColor);
      
      // Aplicar cor primária dinamicamente ao CSS
      applyPrimaryColor(brandingData.primaryColor);
    }
  }, [brandingData]);

  const setAppName = (name: string) => setAppNameState(name);
  const setAppLogo = (logo: string | null) => setAppLogoState(logo);
  const setPrimaryColor = (color: string) => {
    setPrimaryColorState(color);
    applyPrimaryColor(color);
  };

  useEffect(() => {
    document.title = appName;
  }, [appName]);

  return (
    <BrandingContext.Provider value={{ 
      appName, 
      appLogo, 
      primaryColor,
      setAppName, 
      setAppLogo,
      setPrimaryColor
    }}>
      {children}
    </BrandingContext.Provider>
  );
}

export function useBranding() {
  const context = useContext(BrandingContext);
  if (context === undefined) {
    throw new Error('useBranding must be used within a BrandingProvider');
  }
  return context;
}

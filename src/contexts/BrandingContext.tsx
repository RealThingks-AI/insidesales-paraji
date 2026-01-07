import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface BrandingSettings {
  app_name: string;
  logo_url: string | null;
  favicon_url: string | null;
  primary_color: string;
  secondary_color: string;
  accent_color: string;
  font_family: string;
  custom_css: string | null;
}

interface BrandingContextType {
  branding: BrandingSettings | null;
  loading: boolean;
  refreshBranding: () => Promise<void>;
}

const defaultBranding: BrandingSettings = {
  app_name: 'CRM',
  logo_url: null,
  favicon_url: null,
  primary_color: '#0284c7',
  secondary_color: '#334155',
  accent_color: '#f8fafc',
  font_family: 'Inter',
  custom_css: null,
};

const BrandingContext = createContext<BrandingContextType>({
  branding: defaultBranding,
  loading: true,
  refreshBranding: async () => {},
});

export const useBranding = () => useContext(BrandingContext);

// Helper to convert hex to HSL
const hexToHSL = (hex: string): string => {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return '0 0% 0%';

  let r = parseInt(result[1], 16) / 255;
  let g = parseInt(result[2], 16) / 255;
  let b = parseInt(result[3], 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
        break;
      case g:
        h = ((b - r) / d + 2) / 6;
        break;
      case b:
        h = ((r - g) / d + 4) / 6;
        break;
    }
  }

  return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
};

export const BrandingProvider = ({ children }: { children: ReactNode }) => {
  const [branding, setBranding] = useState<BrandingSettings | null>(null);
  const [loading, setLoading] = useState(true);

  const applyBranding = (settings: BrandingSettings) => {
    const root = document.documentElement;

    // Apply custom CSS variables for branding colors
    if (settings.primary_color) {
      root.style.setProperty('--branding-primary', hexToHSL(settings.primary_color));
    }
    if (settings.secondary_color) {
      root.style.setProperty('--branding-secondary', hexToHSL(settings.secondary_color));
    }
    if (settings.accent_color) {
      root.style.setProperty('--branding-accent', hexToHSL(settings.accent_color));
    }

    // Apply font family
    if (settings.font_family && settings.font_family !== 'Inter') {
      // Load Google Font
      const fontLink = document.getElementById('branding-font') as HTMLLinkElement;
      const fontUrl = `https://fonts.googleapis.com/css2?family=${settings.font_family.replace(' ', '+')}:wght@400;500;600;700&display=swap`;
      
      if (fontLink) {
        fontLink.href = fontUrl;
      } else {
        const link = document.createElement('link');
        link.id = 'branding-font';
        link.rel = 'stylesheet';
        link.href = fontUrl;
        document.head.appendChild(link);
      }
      root.style.setProperty('--font-family-branding', settings.font_family);
    }

    // Update document title
    if (settings.app_name) {
      document.title = settings.app_name;
    }

    // Update favicon
    if (settings.favicon_url) {
      let link = document.querySelector("link[rel~='icon']") as HTMLLinkElement;
      if (!link) {
        link = document.createElement('link');
        link.rel = 'icon';
        document.head.appendChild(link);
      }
      link.href = settings.favicon_url;
    }

    // Apply custom CSS
    if (settings.custom_css) {
      let styleEl = document.getElementById('branding-custom-css') as HTMLStyleElement;
      if (!styleEl) {
        styleEl = document.createElement('style');
        styleEl.id = 'branding-custom-css';
        document.head.appendChild(styleEl);
      }
      styleEl.textContent = settings.custom_css;
    }
  };

  const fetchBranding = async () => {
    try {
      const { data, error } = await supabase
        .from('branding_settings')
        .select('*')
        .single();

      if (error && error.code !== 'PGRST116') {
        throw error;
      }

      const settings = data || defaultBranding;
      setBranding(settings);
      applyBranding(settings);
    } catch (error) {
      console.error('Error fetching branding:', error);
      setBranding(defaultBranding);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBranding();
  }, []);

  return (
    <BrandingContext.Provider value={{ branding, loading, refreshBranding: fetchBranding }}>
      {children}
    </BrandingContext.Provider>
  );
};

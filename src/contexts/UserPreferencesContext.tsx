import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { format as dateFnsFormat } from 'date-fns';

interface UserPreferences {
  date_format: string;
  time_format: string;
  currency: string;
  default_module: string;
  timezone: string;
}

interface UserPreferencesContextType {
  preferences: UserPreferences;
  loading: boolean;
  formatDate: (date: Date | string) => string;
  formatTime: (date: Date | string) => string;
  formatDateTime: (date: Date | string) => string;
  formatCurrency: (amount: number) => string;
  refreshPreferences: () => Promise<void>;
}

const defaultPreferences: UserPreferences = {
  date_format: 'DD/MM/YYYY',
  time_format: '12h',
  currency: 'INR',
  default_module: 'dashboard',
  timezone: 'Asia/Kolkata',
};

const UserPreferencesContext = createContext<UserPreferencesContextType>({
  preferences: defaultPreferences,
  loading: true,
  formatDate: () => '',
  formatTime: () => '',
  formatDateTime: () => '',
  formatCurrency: () => '',
  refreshPreferences: async () => {},
});

export const useUserPreferences = () => useContext(UserPreferencesContext);

// Currency symbols and locale mappings
const currencyConfig: Record<string, { symbol: string; locale: string }> = {
  INR: { symbol: '₹', locale: 'en-IN' },
  USD: { symbol: '$', locale: 'en-US' },
  EUR: { symbol: '€', locale: 'de-DE' },
  GBP: { symbol: '£', locale: 'en-GB' },
  AED: { symbol: 'د.إ', locale: 'ar-AE' },
  SGD: { symbol: 'S$', locale: 'en-SG' },
};

// Date format mappings to date-fns format strings
const dateFormatMap: Record<string, string> = {
  'DD/MM/YYYY': 'dd/MM/yyyy',
  'MM/DD/YYYY': 'MM/dd/yyyy',
  'YYYY-MM-DD': 'yyyy-MM-dd',
  'DD-MMM-YYYY': 'dd-MMM-yyyy',
};

export const UserPreferencesProvider = ({ children }: { children: ReactNode }) => {
  const { user } = useAuth();
  const [preferences, setPreferences] = useState<UserPreferences>(defaultPreferences);
  const [loading, setLoading] = useState(true);

  const fetchPreferences = useCallback(async () => {
    if (!user) {
      setPreferences(defaultPreferences);
      setLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('user_preferences')
        .select('*')
        .eq('user_id', user.id)
        .single();

      if (error && error.code !== 'PGRST116') {
        throw error;
      }

      if (data) {
        setPreferences({
          date_format: data.date_format || defaultPreferences.date_format,
          time_format: data.time_format || defaultPreferences.time_format,
          currency: data.currency || defaultPreferences.currency,
          default_module: data.default_module || defaultPreferences.default_module,
          timezone: data.timezone || defaultPreferences.timezone,
        });
      }
    } catch (error) {
      console.error('Error fetching user preferences:', error);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchPreferences();
  }, [fetchPreferences]);

  const formatDate = useCallback((date: Date | string): string => {
    if (!date) return '';
    const dateObj = typeof date === 'string' ? new Date(date) : date;
    const formatString = dateFormatMap[preferences.date_format] || 'dd/MM/yyyy';
    return dateFnsFormat(dateObj, formatString);
  }, [preferences.date_format]);

  const formatTime = useCallback((date: Date | string): string => {
    if (!date) return '';
    const dateObj = typeof date === 'string' ? new Date(date) : date;
    const formatString = preferences.time_format === '24h' ? 'HH:mm' : 'h:mm a';
    return dateFnsFormat(dateObj, formatString);
  }, [preferences.time_format]);

  const formatDateTime = useCallback((date: Date | string): string => {
    if (!date) return '';
    return `${formatDate(date)} ${formatTime(date)}`;
  }, [formatDate, formatTime]);

  const formatCurrency = useCallback((amount: number): string => {
    const config = currencyConfig[preferences.currency] || currencyConfig.INR;
    return new Intl.NumberFormat(config.locale, {
      style: 'currency',
      currency: preferences.currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(amount);
  }, [preferences.currency]);

  return (
    <UserPreferencesContext.Provider
      value={{
        preferences,
        loading,
        formatDate,
        formatTime,
        formatDateTime,
        formatCurrency,
        refreshPreferences: fetchPreferences,
      }}
    >
      {children}
    </UserPreferencesContext.Provider>
  );
};

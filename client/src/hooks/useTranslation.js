import { useState, useEffect, useCallback } from 'react';
import api from '../services/api';

const useTranslation = () => {
    const [locale, setLocale] = useState(localStorage.getItem('sarga_locale') || 'en');
    const [overrides, setOverrides] = useState({});

    const fetchTranslations = useCallback(async () => {
        try {
            const currentLocale = localStorage.getItem('sarga_locale') || 'en';
            const { data } = await api.get(`/i18n/${currentLocale}`);
            setOverrides(data || {});
            setLocale(currentLocale);
        } catch (err) {
            console.error('Failed to fetch translations', err);
        }
    }, []);

    useEffect(() => {
        fetchTranslations();
        
        const handleUpdate = () => {
            fetchTranslations();
        };

        window.addEventListener('companySettingsUpdated', handleUpdate);
        return () => window.removeEventListener('companySettingsUpdated', handleUpdate);
    }, [fetchTranslations]);

    const t = (key, defaultValue) => {
        return overrides[key] || defaultValue;
    };

    return { t, locale, refresh: fetchTranslations };
};

export default useTranslation;

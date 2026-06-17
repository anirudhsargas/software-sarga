import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import api from '../api'

const I18nContext = createContext()

const FALLBACK = {
  en: {
    common: {
      'nav.home': 'Home',
      'nav.services': 'Services',
      'nav.products': 'Products',
      'nav.portfolio': 'Portfolio',
      'nav.blog': 'Blog',
      'nav.samples': 'Samples',
      'nav.consultation': 'Free Consultation',
      'nav.track': 'Track Order',
      'nav.upload': 'Upload Artwork',
      'nav.pickup': 'Schedule Pickup',
      'nav.contact': 'Contact',
      'nav.signin': 'Sign In',
      'nav.design': 'Design Hub',
      'nav.get_quote': 'Get a Quote',
      'cart.add': 'Add to Cart',
      'cart.checkout': 'Proceed to Checkout',
      'cart.empty': 'Your cart is empty',
      'cart.title': 'Cart',
      'checkout.title': 'Checkout',
      'checkout.place_order': 'Place Order',
      'pricing.title': 'Price Calculator',
      'pricing.quantity': 'Quantity',
      'pricing.total': 'Total',
      'pricing.gst': 'GST',
      'pricing.unit_price': 'Unit Price',
      'pricing.setup_fee': 'Setup Fee',
      'pricing.finishes': 'Add-on Finishes',
      'product.pricing': 'View Pricing',
      'order.track': 'Track Order',
      'common.loading': 'Loading...',
      'common.error': 'Error',
      'common.submit': 'Submit',
      'common.cancel': 'Cancel',
      'common.save': 'Save',
      'common.search': 'Search',
      'hero.title': 'Professional Printing Since 1994',
      'hero.subtitle': 'Offset & Digital Printing, Design, Binding — All Under One Roof',
      'hero.cta': 'Explore Services',
    },
    theme: {
      'toggle_aria_label': 'Toggle dark/light theme',
      'toggle_title_dark': 'Switch to Dark Mode',
      'toggle_title_light': 'Switch to Light Mode'
    },
    language: {
      'en': 'EN',
      'ml': 'മല',
      'switch_to_en': 'Switch to English',
      'switch_to_ml': 'Switch to Malayalam'
    },
    footer: {
      'brand_description': 'പ്രീമ്യം പ്രിന്റിംഗ്, ഫോട്ടോകോപ്പി & ഡിസൈൻ സേവനങ്ങൾ. 1994 മുതൽ കേരളത്തിൽ വിശ്വാസം നിർമ്മിക്കുന്നു.',
      'quick_links': 'Quick Links',
      'services': 'Services',
      'contact_us': 'Contact Us',
      'location': 'പെറാമ്ബ്ര & മെപ്പായ്യുർ, കേരളം',
      'phone_pba': 'PBA: +91 94951 77283',
      'phone_mpr': 'MPR: +91 91883 31197',
      'hours': 'Mon - Sat: 9:00 AM - 7:00 PM',
      'company_name': 'Sarga',
      'since_year': '1994 മുതൽ',
      'all_rights_reserved': 'All Rights Reserved.',
      'privacy_policy': 'Privacy Policy',
      'terms_of_service': 'Terms of Service',
      'service_offset_digital': 'Offset & Digital Printing',
      'service_photostat_id': 'Photostat & ID Cards',
      'service_mementos_frames': 'Souvenirs & Photo Frames',
      'service_hard_spiral_binding': 'Hard & Spiral Binding',
      'service_rubber_seals_stamps': 'Rubber Seals & Stamps'
    }
  },
  ml: {
    common: {
      'nav.home': 'ഹോം',
      'nav.services': 'സേവനങ്ങൾ',
      'nav.products': 'ഉൽപ്പന്നങ്ങൾ',
      'nav.portfolio': 'പോർട്ട്ഫോളിയോ',
      'nav.blog': 'ബ്ലോഗ്',
      'nav.samples': 'സാമ്പിളുകൾ',
      'nav.consultation': 'സൗജന്യ കൺസൾട്ടേഷൻ',
      'nav.track': 'ഓർഡർ ട്രാക്ക് ചെയ്യുക',
      'nav.upload': 'ആർട്ട്‌വർക്ക് അപ്‌ലോഡ്',
      'nav.pickup': 'പിക്കപ്പ് ഷെഡ്യൂൾ ചെയ്യുക',
      'nav.contact': 'കോൺടാക്റ്റ്',
      'nav.signin': 'സൈൻ ഇൻ',
      'nav.design': 'ഡിസൈൻ ഹബ്',
      'nav.get_quote': 'കോട്ടേഷൻ നേടുക',
      'cart.add': 'കാർട്ടിലേക്ക് ചേർക്കുക',
      'cart.checkout': 'ചെക്കൗട്ടിലേക്ക് പോകുക',
      'cart.empty': 'നിങ്ങളുടെ കാർട്ട് ശൂന്യമാണ്',
      'cart.title': 'കാർട്ട്',
      'checkout.title': 'ചെക്കൗട്ട്',
      'checkout.place_order': 'ഓർഡർ ചെയ്യുക',
      'pricing.title': 'വില കാൽക്കുലേറ്റർ',
      'pricing.quantity': 'അളവ്',
      'pricing.total': 'ആകെ',
      'pricing.gst': 'ജിഎസ്ടി',
      'pricing.unit_price': 'യൂണിറ്റ് വില',
      'pricing.setup_fee': 'സെറ്റപ്പ് ഫീ',
      'pricing.finishes': 'അധിക ഫിനിഷുകൾ',
      'product.pricing': 'വില കാണുക',
      'order.track': 'ഓർഡർ ട്രാക്ക് ചെയ്യുക',
      'common.loading': 'ലോഡ് ചെയ്യുന്നു...',
      'common.error': 'പിശക്',
      'common.submit': 'സമർപ്പിക്കുക',
      'common.cancel': 'റദ്ദാക്കുക',
      'common.save': 'സേവ് ചെയ്യുക',
      'common.search': 'തിരയുക',
      'hero.title': '1994 മുതൽ പ്രൊഫഷണൽ പ്രിന്റിംഗ്',
      'hero.subtitle': 'ഓഫ്‌സെറ്റ് & ഡിജിറ്റൽ പ്രിന്റിംഗ്, ഡിസൈൻ, ബൈൻഡിംഗ് — എല്ലാം ഒരു കുടക്കീഴിൽ',
      'hero.cta': 'സേവനങ്ങൾ കാണുക',
    },
    theme: {
      'toggle_aria_label': 'തീം മാറ്റുക',
      'toggle_title_dark': 'ഡാർക്ക് മോഡിലേക്ക് മാറ്റുക',
      'toggle_title_light': 'ലൈറ്റ് മോഡിലേക്ക് മാറ്റുക'
    },
    language: {
      'en': 'EN',
      'ml': 'മല',
      'switch_to_en': 'Switch to English',
      'switch_to_ml': 'Switch to Malayalam'
    },
    footer: {
      'brand_description': 'പ്രീമിയം പ്രിന്റിംഗ്, ഫോട്ടോകോപ്പി & ഡിസൈൻ സേവനങ്ങൾ. 1994 മുതല്‍ കേരളത്തിൽ വിശ്വാസം നിര്‍മ്മിക്കുന്നു.',
      'quick_links': 'പെട്ടെന്നുള്ള ലിങ്കുകള്‍',
      'services': 'സേവനങ്ങൾ',
      'contact_us': 'ഞങ്ങളെ ബന്ധപ്പെടുക',
      'location': 'പെറാമ്ബ്ര & മെപ്പായ്യുർ, കേരളം',
      'phone_pba': 'PBA: +91 94951 77283',
      'phone_mpr': 'MPR: +91 91883 31197',
      'hours': 'Mon - Sat: 9:00 AM - 7:00 PM',
      'company_name': 'Sarga',
      'since_year': '1994 മുതല്‍',
      'all_rights_reserved': 'എല്ലാ അവകാശങ്ങളും സുരക്ഷിതമാണ്',
      'privacy_policy': 'സ്വകാര്യതാ നയം',
      'terms_of_service': 'സേവന നിബന്ധനകള്‍',
      'service_offset_digital': 'ഒഫ്‍സെറ്റ് & ഡിജിറ്റൽ പ്രിന്റിംഗ്',
      'service_photostat_id': 'ഫോട്ടോസ്റ്റാറ്റ് & ഐഡി കാർഡുകൾ',
      'service_mementos_frames': 'സമ്മാനങ്ങളും ഫോട്ടോ ഫ്രെയിമുകളും',
      'service_hard_spiral_binding': 'ഹാര്‍ഡ് & സ്‌പൈറല്‍ ബൈൻഡിംഗ്',
      'service_rubber_seals_stamps': 'റബ്ബർ സീലുകള്‍ & സ്റ്റാം്പുകൾ'
    }
  }
}


export function I18nProvider({ children }) {
  const [lang, setLangState] = useState(() => {
    try { return localStorage.getItem('sarga_lang') || 'en' } catch { return 'en' }
  })
  const [translations, setTranslations] = useState({})

  useEffect(() => {
    localStorage.setItem('sarga_lang', lang)
    document.documentElement.lang = lang === 'ml' ? 'ml' : 'en'

    api.get(`/website/translations/${lang}`).then(res => {
      if (res.data?.translations) setTranslations(res.data.translations)
    }).catch(() => {
      setTranslations(FALLBACK[lang] || FALLBACK.en)
    })
  }, [lang])

  const t = useCallback((key, namespace = 'common', fallback) => {
    const ns = translations[namespace] || FALLBACK[lang]?.[namespace] || FALLBACK.en[namespace] || {}
    return ns[key] || fallback || key
  }, [translations, lang])

  const setLang = (newLang) => {
    if (['en', 'ml'].includes(newLang)) setLangState(newLang)
  }

  return (
    <I18nContext.Provider value={{ lang, setLang, t }}>
      {children}
    </I18nContext.Provider>
  )
}

export const useI18n = () => useContext(I18nContext)

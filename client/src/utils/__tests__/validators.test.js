import { describe, it, expect } from 'vitest';
import {
  validatePhone, validateEmail, validateGST, validatePAN, validatePIN,
  validateName, validatePrice, validateQuantity, validateDate, validateTime,
  validatePercentage, validateURL, validateSKU, validateAddress,
  validatePassword, validateVendorCode, validateString, validateEnum,
  validateInteger, validateOTP, validateIPAddress, validatePasswordMatch,
  validateFields, filterMobile,
} from '../validators';

describe('validatePhone', () => {
  it('validates 10-digit Indian mobile', () => {
    expect(validatePhone('9876543210').valid).toBe(true);
  });

  it('rejects empty', () => {
    expect(validatePhone('').valid).toBe(false);
    expect(validatePhone(null).valid).toBe(false);
  });

  it('accepts international with +', () => {
    expect(validatePhone('+19876543210').valid).toBe(true);
  });

  it('rejects short number', () => {
    expect(validatePhone('12345').valid).toBe(false);
  });
});

describe('filterMobile', () => {
  it('strips non-digits and caps at 10', () => {
    expect(filterMobile('abc9876543210xyz')).toBe('9876543210');
    expect(filterMobile('1234567890123')).toBe('1234567890');
  });
});

describe('validateEmail', () => {
  it('accepts valid email', () => {
    expect(validateEmail('test@example.com').valid).toBe(true);
  });

  it('accepts empty (optional)', () => {
    expect(validateEmail('').valid).toBe(true);
  });

  it('rejects invalid', () => {
    expect(validateEmail('not-email').valid).toBe(false);
  });
});

describe('validateGST', () => {
  it('accepts valid GST', () => {
    expect(validateGST('32ABCDE1234F1Z5').valid).toBe(true);
  });

  it('accepts empty', () => {
    expect(validateGST('').valid).toBe(true);
  });

  it('rejects invalid', () => {
    expect(validateGST('invalid').valid).toBe(false);
  });
});

describe('validatePAN', () => {
  it('accepts valid PAN', () => {
    expect(validatePAN('ABCDE1234F').valid).toBe(true);
  });

  it('rejects invalid', () => {
    expect(validatePAN('invalid').valid).toBe(false);
  });
});

describe('validatePIN', () => {
  it('accepts 6-digit PIN', () => {
    expect(validatePIN('673121').valid).toBe(true);
  });

  it('rejects short PIN', () => {
    expect(validatePIN('123').valid).toBe(false);
  });
});

describe('validateName', () => {
  it('accepts valid name', () => {
    expect(validateName('John Doe').valid).toBe(true);
  });

  it('rejects empty required name', () => {
    expect(validateName('').valid).toBe(false);
  });

  it('accepts empty optional name', () => {
    expect(validateName('', { required: false }).valid).toBe(true);
  });
});

describe('validatePrice', () => {
  it('accepts valid price', () => {
    expect(validatePrice('100').valid).toBe(true);
  });

  it('rejects negative price', () => {
    expect(validatePrice('-10').valid).toBe(false);
  });

  it('rejects empty required', () => {
    expect(validatePrice('').valid).toBe(false);
  });

  it('accepts empty optional', () => {
    expect(validatePrice('', { required: false }).valid).toBe(true);
  });
});

describe('validateQuantity', () => {
  it('accepts valid quantity', () => {
    expect(validateQuantity('500').valid).toBe(true);
  });

  it('rejects negative', () => {
    expect(validateQuantity('-5').valid).toBe(false);
  });
});

describe('validateDate', () => {
  it('accepts valid YYYY-MM-DD', () => {
    expect(validateDate('2025-01-15').valid).toBe(true);
  });

  it('rejects invalid format', () => {
    expect(validateDate('15-01-2025').valid).toBe(false);
  });
});

describe('validateTime', () => {
  it('accepts HH:MM format', () => {
    expect(validateTime('14:30').valid).toBe(true);
  });

  it('rejects invalid format', () => {
    expect(validateTime('25:00').valid).toBe(false);
  });
});

describe('validatePercentage', () => {
  it('accepts 50%', () => {
    expect(validatePercentage(50).valid).toBe(true);
  });

  it('rejects > 100', () => {
    expect(validatePercentage(150).valid).toBe(false);
  });
});

describe('validateURL', () => {
  it('accepts http/https', () => {
    expect(validateURL('https://example.com').valid).toBe(true);
  });

  it('rejects without protocol', () => {
    expect(validateURL('example.com').valid).toBe(false);
  });
});

describe('validateSKU', () => {
  it('accepts valid SKU', () => {
    expect(validateSKU('SKU-001').valid).toBe(true);
  });

  it('rejects empty required', () => {
    expect(validateSKU('').valid).toBe(false);
  });
});

describe('validateAddress', () => {
  it('accepts valid address', () => {
    expect(validateAddress('123 Main St').valid).toBe(true);
  });
});

describe('validatePassword', () => {
  it('accepts strong password', () => {
    expect(validatePassword('Str0ng!Pass').valid).toBe(true);
  });

  it('rejects weak password', () => {
    expect(validatePassword('weak').valid).toBe(false);
  });
});

describe('validateVendorCode', () => {
  it('accepts 3-letter code', () => {
    expect(validateVendorCode('ABC').valid).toBe(true);
  });

  it('rejects long code', () => {
    expect(validateVendorCode('ABCD').valid).toBe(false);
  });
});

describe('validateString', () => {
  it('validates string length', () => {
    expect(validateString('Hello').valid).toBe(true);
    expect(validateString('').valid).toBe(false);
  });
});

describe('validateEnum', () => {
  it('accepts valid option', () => {
    expect(validateEnum('Admin', ['Admin', 'User']).valid).toBe(true);
  });

  it('rejects invalid option', () => {
    expect(validateEnum('SuperAdmin', ['Admin', 'User']).valid).toBe(false);
  });
});

describe('validateInteger', () => {
  it('accepts integer', () => {
    expect(validateInteger(42).valid).toBe(true);
  });

  it('rejects float', () => {
    expect(validateInteger(4.2).valid).toBe(false);
  });
});

describe('validateOTP', () => {
  it('accepts 6-digit OTP', () => {
    expect(validateOTP('123456').valid).toBe(true);
  });

  it('rejects short OTP', () => {
    expect(validateOTP('123').valid).toBe(false);
  });
});

describe('validateIPAddress', () => {
  it('accepts valid IPv4', () => {
    expect(validateIPAddress('192.168.1.1').valid).toBe(true);
  });

  it('rejects invalid IPv4', () => {
    expect(validateIPAddress('999.999.999.999').valid).toBe(false);
  });
});

describe('validatePasswordMatch', () => {
  it('passes when passwords match', () => {
    expect(validatePasswordMatch('pass', 'pass').valid).toBe(true);
  });

  it('fails when passwords differ', () => {
    expect(validatePasswordMatch('pass1', 'pass2').valid).toBe(false);
  });
});

describe('validateFields', () => {
  it('validates multiple fields', () => {
    const result = validateFields({
      email: () => validateEmail('test@example.com'),
      phone: () => validatePhone('9876543210'),
    });
    expect(result.valid).toBe(true);
  });

  it('collects errors', () => {
    const result = validateFields({
      email: () => validateEmail('invalid'),
      phone: () => validatePhone(''),
    });
    expect(result.valid).toBe(false);
    expect(result.errors.email).toBeTruthy();
    expect(result.errors.phone).toBeTruthy();
  });
});

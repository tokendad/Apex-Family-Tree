import type { Request, Response, NextFunction } from 'express';

interface ValidationRule {
  field: string;
  required?: boolean;
  type?: 'string' | 'number' | 'boolean';
  maxLength?: number;
  enum?: string[];
}

export function validate(rules: ValidationRule[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const errors: string[] = [];
    const body = req.body || {};

    for (const rule of rules) {
      const value = body[rule.field];

      if (rule.required && (value === undefined || value === null || value === '')) {
        errors.push(`${rule.field} is required`);
        continue;
      }

      if (value !== undefined && value !== null) {
        if (rule.type && typeof value !== rule.type) {
          errors.push(`${rule.field} must be a ${rule.type}`);
        }
        if (rule.maxLength && typeof value === 'string' && value.length > rule.maxLength) {
          errors.push(`${rule.field} must be at most ${rule.maxLength} characters`);
        }
        if (rule.enum && !rule.enum.includes(value)) {
          errors.push(`${rule.field} must be one of: ${rule.enum.join(', ')}`);
        }
      }
    }

    if (errors.length > 0) {
      res.status(400).json({ error: 'Validation failed', details: errors });
      return;
    }

    next();
  };
}

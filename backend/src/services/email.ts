import { SettingsRepository } from '../repositories/SettingsRepository.js';
import type { Logger } from './logger.js';

export interface EmailService {
  sendInvite(to: string, inviteToken: string, invitedBy: string, message?: string): Promise<boolean>;
  sendPasswordReset(to: string, resetToken: string): Promise<boolean>;
}

export function createEmailService(logger: Logger): EmailService {
  return {
    async sendInvite(to, inviteToken, invitedBy, message) {
      const settings = new SettingsRepository();
      const smtpHost = settings.getSettingValue('smtp_host');

      if (!smtpHost) {
        logger.warn(`Email not configured. Invite token for ${to}: ${inviteToken}`);
        return false;
      }

      // TODO: Implement actual nodemailer sending
      logger.info(`Would send invite email to ${to} from ${invitedBy}${message ? ` with message: ${message}` : ''}`);
      return true;
    },

    async sendPasswordReset(to, resetToken) {
      const settings = new SettingsRepository();
      const smtpHost = settings.getSettingValue('smtp_host');

      if (!smtpHost) {
        logger.warn(`Email not configured. Reset token for ${to}: ${resetToken}`);
        return false;
      }

      logger.info(`Would send password reset email to ${to}`);
      return true;
    },
  };
}

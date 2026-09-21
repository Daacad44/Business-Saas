export { createDispatchNotification } from "./dispatch.js";
export type { DispatchDeps, DispatchInput, DispatchResult } from "./dispatch.js";

export {
  isEmailConfigured,
  isSmsConfigured,
  isWhatsAppConfigured,
  resolveDriver,
} from "./drivers/index.js";
export type {
  ChannelSendInput,
  ChannelSendResult,
  DriversConfig,
  NotificationChannelDriver,
  SmsDriverConfig,
  SmtpDriverConfig,
  WhatsAppDriverConfig,
} from "./drivers/index.js";

export type { NotificationsLogger } from "./logger.js";
export { maskRecipient } from "./mask.js";
export { formatMoney, renderTemplate } from "./render.js";
export type { TemplateVariables } from "./render.js";
export { createNotificationsService } from "./service.js";
export type { NotificationsService, NotificationsServiceConfig } from "./service.js";

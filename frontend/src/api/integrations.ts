import { api } from './client'
import type {
  ApiKey,
  ApiKeyCreated,
  ApiKeyInput,
  Page,
  PageParams,
  UUID,
  Webhook,
  WebhookDelivery,
  WebhookInput,
  WebhookUpdateInput,
} from './types'

/** Owner-only: API keys and webhooks. */
export const integrationsApi = {
  listApiKeys: () => api.get<ApiKey[]>('/integrations/api-keys'),
  createApiKey: (input: ApiKeyInput) => api.post<ApiKeyCreated>('/integrations/api-keys', input),
  revokeApiKey: (id: UUID) => api.delete<ApiKey>(`/integrations/api-keys/${id}`),

  listEventTypes: () => api.get<string[]>('/integrations/webhook-events'),
  listWebhooks: () => api.get<Webhook[]>('/integrations/webhooks'),
  createWebhook: (input: WebhookInput) => api.post<Webhook>('/integrations/webhooks', input),
  updateWebhook: (id: UUID, input: WebhookUpdateInput) =>
    api.patch<Webhook>(`/integrations/webhooks/${id}`, input),
  deleteWebhook: (id: UUID) => api.delete(`/integrations/webhooks/${id}`),
  rotateSecret: (id: UUID) => api.post<Webhook>(`/integrations/webhooks/${id}/rotate-secret`),
  sendTest: (id: UUID) => api.post<WebhookDelivery>(`/integrations/webhooks/${id}/test`),
  listDeliveries: (id: UUID, params: PageParams) =>
    api.get<Page<WebhookDelivery>>(`/integrations/webhooks/${id}/deliveries`, params),
  redeliver: (deliveryId: UUID) =>
    api.post<WebhookDelivery>(`/integrations/deliveries/${deliveryId}/redeliver`),
}

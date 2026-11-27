import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { integrationsApi } from '@/api/integrations'
import type { ApiKeyInput, UUID, WebhookInput, WebhookUpdateInput } from '@/api/types'
import { queryKeys } from './queryKeys'

export function useApiKeys() {
  return useQuery({
    queryKey: queryKeys.integrations.apiKeys(),
    queryFn: integrationsApi.listApiKeys,
  })
}

export function useCreateApiKey() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: ApiKeyInput) => integrationsApi.createApiKey(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.integrations.apiKeys() }),
  })
}

export function useRevokeApiKey() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: UUID) => integrationsApi.revokeApiKey(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.integrations.apiKeys() }),
  })
}

export function useWebhookEventTypes() {
  return useQuery({
    queryKey: queryKeys.integrations.eventTypes(),
    queryFn: integrationsApi.listEventTypes,
    staleTime: Infinity,
  })
}

export function useWebhooks() {
  return useQuery({
    queryKey: queryKeys.integrations.webhooks(),
    queryFn: integrationsApi.listWebhooks,
  })
}

function useInvalidateWebhooks() {
  const queryClient = useQueryClient()
  return () => queryClient.invalidateQueries({ queryKey: queryKeys.integrations.all })
}

export function useCreateWebhook() {
  const invalidate = useInvalidateWebhooks()
  return useMutation({
    mutationFn: (input: WebhookInput) => integrationsApi.createWebhook(input),
    onSuccess: invalidate,
    meta: { silentError: true }, // URL rules (https, public host) are shown inline
  })
}

export function useUpdateWebhook() {
  const invalidate = useInvalidateWebhooks()
  return useMutation({
    mutationFn: ({ id, input }: { id: UUID; input: WebhookUpdateInput }) =>
      integrationsApi.updateWebhook(id, input),
    onSuccess: invalidate,
  })
}

export function useWebhookActions(id: UUID) {
  const invalidate = useInvalidateWebhooks()
  return {
    remove: useMutation({
      mutationFn: () => integrationsApi.deleteWebhook(id),
      onSuccess: invalidate,
    }),
    rotate: useMutation({
      mutationFn: () => integrationsApi.rotateSecret(id),
      onSuccess: invalidate,
    }),
    test: useMutation({ mutationFn: () => integrationsApi.sendTest(id), onSuccess: invalidate }),
    redeliver: useMutation({
      mutationFn: (deliveryId: UUID) => integrationsApi.redeliver(deliveryId),
      onSuccess: invalidate,
    }),
  }
}

export function useWebhookDeliveries(id: UUID, page: number) {
  return useQuery({
    queryKey: queryKeys.integrations.deliveries(id, page),
    queryFn: () => integrationsApi.listDeliveries(id, { page, size: 20 }),
    placeholderData: keepPreviousData,
    // Deliveries move from pending to succeeded/failed in the background worker.
    refetchInterval: (query) =>
      query.state.data?.items.some((d) => d.status === 'pending') ? 5_000 : false,
  })
}

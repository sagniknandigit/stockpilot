import { LinkTabs } from '@/components/ui/LinkTabs'

export function PurchasingTabs() {
  return (
    <LinkTabs
      id="purchasing"
      label="Purchasing sections"
      tabs={[
        { to: '/purchasing', label: 'Purchase orders', end: true },
        { to: '/purchasing/suppliers', label: 'Suppliers' },
      ]}
    />
  )
}

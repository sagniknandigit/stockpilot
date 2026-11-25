import { Plus } from 'lucide-react'
import { useState } from 'react'
import { useCan } from '@/auth/AuthContext'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { toast } from '@/components/ui/toast'
import { useCategories, useCreateCategory } from '@/hooks/useCatalog'

interface CategoryFieldProps {
  id: string
  value: string
  onChange: (categoryId: string) => void
}

/** Category select with inline "create new" for managers. */
export function CategoryField({ id, value, onChange }: CategoryFieldProps) {
  const canManage = useCan('manager')
  const categories = useCategories()
  const createCategory = useCreateCategory()
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')

  function submit() {
    const trimmed = name.trim()
    if (!trimmed) return
    createCategory.mutate(trimmed, {
      onSuccess: (category) => {
        onChange(category.id)
        setCreating(false)
        setName('')
        toast.success(`Category “${category.name}” created`)
      },
    })
  }

  if (creating) {
    return (
      <div className="flex gap-2">
        <Input
          id={id}
          value={name}
          autoFocus
          maxLength={80}
          placeholder="New category name"
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => {
            // Don't submit the surrounding product form.
            if (event.key === 'Enter') {
              event.preventDefault()
              submit()
            }
            if (event.key === 'Escape') {
              event.preventDefault()
              event.stopPropagation()
              setCreating(false)
            }
          }}
        />
        <Button onClick={submit} loading={createCategory.isPending} disabled={!name.trim()}>
          Add
        </Button>
        <Button variant="ghost" onClick={() => setCreating(false)}>
          Cancel
        </Button>
      </div>
    )
  }

  return (
    <div className="flex gap-2">
      <Select
        id={id}
        className="flex-1"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={categories.isPending}
      >
        <option value="">No category</option>
        {categories.data?.map((category) => (
          <option key={category.id} value={category.id}>
            {category.name}
          </option>
        ))}
      </Select>
      {canManage && (
        <Button variant="secondary" onClick={() => setCreating(true)} aria-label="New category">
          <Plus /> New
        </Button>
      )}
    </div>
  )
}

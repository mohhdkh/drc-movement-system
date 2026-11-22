export function ActiveBadge({ active }: { active: boolean }) {
  return (
    <span className={`active-badge ${active ? 'is-active' : 'is-inactive'}`}>
      {active ? 'Active' : 'Inactive'}
    </span>
  )
}

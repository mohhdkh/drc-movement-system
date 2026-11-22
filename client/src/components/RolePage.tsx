interface RolePageProps {
  roleName: string
}

export function RolePage({ roleName }: RolePageProps) {
  return (
    <section className="role-page" aria-labelledby="system-title">
      <div className="role-page-content">
        <p className="role-label">{roleName}</p>
        <h2 id="system-title">DRC Movement Management System</h2>
        <div className="title-rule" aria-hidden="true" />
      </div>
    </section>
  )
}


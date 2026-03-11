type AppHref = `/${string}`;

interface BreadcrumbItem {
  label: string;
  href?: AppHref;
}

export function Breadcrumbs({ items }: { items: BreadcrumbItem[] }) {
  return (
    <nav aria-label="Breadcrumb" className="breadcrumb-trail">
      {items.map((item, index) => {
        const isLast = index === items.length - 1;
        const content = item.href && !isLast ? <a href={item.href}>{item.label}</a> : item.label;

        return (
          <span
            key={`${item.label}-${index}`}
            className={isLast ? "breadcrumb-trail__item breadcrumb-trail__item--current" : "breadcrumb-trail__item"}
          >
            {content}
            {!isLast ? <span className="breadcrumb-trail__sep">/</span> : null}
          </span>
        );
      })}
    </nav>
  );
}

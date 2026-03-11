type AppHref = `/${string}`;

interface AccessGuideProps {
  eyebrow: string;
  title: string;
  message: string;
  primaryAction: {
    href: AppHref;
    label: string;
  };
  secondaryAction?: {
    href: AppHref;
    label: string;
  };
}

export function AccessGuide({
  eyebrow,
  title,
  message,
  primaryAction,
  secondaryAction
}: AccessGuideProps) {
  return (
    <article className="surface-card access-guide">
      <div className="access-guide__copy">
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        <p>{message}</p>
      </div>
      <div className="button-row">
        <a href={primaryAction.href} className="button">
          {primaryAction.label}
        </a>
        {secondaryAction ? (
          <a href={secondaryAction.href} className="button button-secondary">
            {secondaryAction.label}
          </a>
        ) : null}
      </div>
    </article>
  );
}
